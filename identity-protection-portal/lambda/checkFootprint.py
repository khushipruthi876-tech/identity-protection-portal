import json
import urllib.request
import urllib.error
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("SearchHistory")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

# ---------- Platforms to check ----------
# Each entry: display name, profile URL template, and how to detect "exists"
PLATFORMS = [
    {"name": "GitHub", "url": "https://github.com/{u}"},
    {"name": "Reddit", "url": "https://www.reddit.com/user/{u}/about.json"},
    {"name": "Twitch", "url": "https://www.twitch.tv/{u}"},
    {"name": "Tumblr", "url": "https://{u}.tumblr.com"},
    {"name": "Pinterest", "url": "https://www.pinterest.com/{u}/"},
    {"name": "HackerNews", "url": "https://news.ycombinator.com/user?id={u}"},
]


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")

    # ---------- Handle CORS preflight ----------
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"message": "CORS preflight OK"})
        }

    try:
        body = json.loads(event.get("body", "{}"))
        username = body.get("username", "").strip()
        user_id = body.get("userId", "").strip()

        if not username:
            return response(400, {"error": "Please provide a username to check."})

        found_on = []
        checked_count = 0

        for platform in PLATFORMS:
            url = platform["url"].format(u=username)
            exists = check_url_exists(url)
            checked_count += 1
            if exists:
                found_on.append(platform["name"])

        # ---------- Save this scan to DynamoDB ----------
        if user_id:
            table.put_item(Item={
                "userId": user_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "scanType": "footprint",
                "searchedUsername": username,
                "platformsFound": found_on,
                "platformsChecked": checked_count
            })

        return response(200, {
            "username": username,
            "platformsChecked": checked_count,
            "platformsFound": found_on,
            "foundCount": len(found_on)
        })

    except Exception as e:
        return response(500, {"error": f"Something went wrong: {str(e)}"})


def check_url_exists(url):
    """Returns True if the profile URL looks like it exists (HTTP 200)."""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (identity-protection-portal footprint scanner)"
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        # 404 = not found, anything else we treat as "not found" too (safe default)
        return False
    except Exception:
        # Timeout, DNS error, blocked request, etc. — treat as unknown/not found
        return False


def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_dict)
    }
