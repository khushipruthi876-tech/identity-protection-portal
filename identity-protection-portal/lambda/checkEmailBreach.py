import json
import urllib.request
import urllib.error
import boto3
from datetime import datetime, timezone
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("SearchHistory")
ses = boto3.client("ses", region_name="ap-south-1")

# IMPORTANT: This must be an email address verified in SES.
# In sandbox mode, both sender AND recipient must be verified.
ALERT_SENDER_EMAIL = "pruthikhushi01@gmail.com"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
}


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")

    # ---------- Handle CORS preflight (OPTIONS) request ----------
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"message": "CORS preflight OK"})
        }

    # ---------- Route: GET history ----------
    if http_method == "GET" and "history" in raw_path:
        return get_history(event)

    # ---------- Route: POST breach check ----------
    return check_breach(event)


def check_breach(event):
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip()
        user_id = body.get("userId", "").strip()  # the logged-in user's email

        if not email or "@" not in email:
            return response(400, {"error": "Please provide a valid email address."})

        # ---------- Call XposedOrNot free API ----------
        api_url = f"https://api.xposedornot.com/v1/check-email/{email}"
        req = urllib.request.Request(api_url, headers={"User-Agent": "identity-protection-portal"})

        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                result = {"breaches": [], "email": email}
            else:
                raise

        raw_breaches = result.get("breaches", [])
        breach_names = [b[0] if isinstance(b, list) else b for b in raw_breaches]

        # ---------- Save this search to DynamoDB (only if we know who the user is) ----------
        if user_id:
            table.put_item(Item={
                "userId": user_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "searchedEmail": email,
                "breachCount": len(breach_names),
                "breaches": breach_names
            })

        # ---------- Send an email alert if breaches were found ----------
        if user_id and len(breach_names) > 0:
            send_breach_alert(user_id, email, breach_names)

        return response(200, {
            "email": email,
            "breachCount": len(breach_names),
            "breaches": breach_names
        })

    except Exception as e:
        return response(500, {"error": f"Something went wrong: {str(e)}"})


def send_breach_alert(recipient_email, searched_email, breach_names):
    """Send an SES email alert when breaches are found. Fails silently
    (logs only) so a broken email never breaks the breach check itself."""
    try:
        breach_list_text = "\n".join(f"- {b}" for b in breach_names)

        ses.send_email(
            Source=ALERT_SENDER_EMAIL,
            Destination={"ToAddresses": [recipient_email]},
            Message={
                "Subject": {"Data": "⚠️ Data Breach Alert - Identity Protection Portal"},
                "Body": {
                    "Text": {
                        "Data": (
                            f"We found that {searched_email} appears in the following "
                            f"data breach(es):\n\n{breach_list_text}\n\n"
                            f"Recommended actions:\n"
                            f"- Change your password for the affected service(s)\n"
                            f"- Enable two-factor authentication where possible\n"
                            f"- Avoid reusing this password elsewhere\n\n"
                            f"— Digital Identity Protection Portal"
                        )
                    }
                }
            }
        )
    except Exception as e:
        # Don't let an email failure break the breach check response
        print(f"Failed to send SES alert: {str(e)}")


def get_history(event):
    try:
        params = event.get("queryStringParameters") or {}
        user_id = params.get("userId", "").strip()

        if not user_id:
            return response(400, {"error": "Missing userId parameter."})

        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("userId").eq(user_id),
            ScanIndexForward=False,   # newest first
            Limit=10
        )

        items = result.get("Items", [])

        return response(200, {"history": items})

    except Exception as e:
        return response(500, {"error": f"Something went wrong: {str(e)}"})


def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_dict, default=decimal_default)
    }


def decimal_default(obj):
    # DynamoDB returns numbers as Decimal; convert for JSON serialization
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError