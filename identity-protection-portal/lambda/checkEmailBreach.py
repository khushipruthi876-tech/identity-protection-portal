import json
import urllib.request
import urllib.error


def lambda_handler(event, context):
    # ---------- CORS headers (required so your S3-hosted frontend can call this) ----------
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }

    try:
        # API Gateway sends the request body as a JSON string
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "").strip()

        if not email or "@" not in email:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Please provide a valid email address."})
            }

        # ---------- Call XposedOrNot free API ----------
        api_url = f"https://api.xposedornot.com/v1/check-email/{email}"

        req = urllib.request.Request(api_url, headers={"User-Agent": "identity-protection-portal"})

        try:
            with urllib.request.urlopen(req, timeout=8) as response:
                result = json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # 404 from XposedOrNot means "no breaches found" (clean email)
                result = {"breaches": [], "email": email}
            else:
                raise

        # Flatten breach list: XposedOrNot returns [["Adobe"], ["LinkedIn"]]
        raw_breaches = result.get("breaches", [])
        breach_names = [b[0] if isinstance(b, list) else b for b in raw_breaches]

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "email": email,
                "breachCount": len(breach_names),
                "breaches": breach_names
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": f"Something went wrong: {str(e)}"})
        }
