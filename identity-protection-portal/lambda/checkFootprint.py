import json
import urllib.request
import urllib.error
import boto3
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("SearchHistory")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

# ---------- Platforms to check ----------
# Each entry: display name, profile URL template.
# Chosen because they respond to simple requests without requiring
# login or aggressive bot-blocking (unlike Instagram, X, Facebook, LinkedIn,
# Snapchat — these platforms actively block automated profile checks and
# were intentionally excluded to avoid giving unreliable/false results).
PLATFORMS = [
    {"name": "GitHub", "url": "https://github.com/{u}"},
    {"name": "Reddit", "url": "https://www.reddit.com/user/{u}/about.json"},
    {"name": "Twitch", "url": "https://www.twitch.tv/{u}"},
    {"name": "Tumblr", "url": "https://{u}.tumblr.com"},
    {"name": "Pinterest", "url": "https://www.pinterest.com/{u}/"},
    {"name": "SoundCloud", "url": "https://soundcloud.com/{u}"},
    {"name": "Spotify", "url": "https://open.spotify.com/user/{u}"},
    {"name": "Telegram", "url": "https://t.me/{u}"},
    {"name": "VSCO", "url": "https://vsco.co/{u}"},
    {"name": "HackerNews", "url": "https://news.ycombinator.com/user?id={u}"},
    {"name": "Quora", "url": "https://www.quora.com/profile/{u}"},
    {"name": "Chess.com", "url": "https://www.chess.com/member/{u}"},
    {"name": "Goodreads", "url": "https://www.goodreads.com/{u}"},
    {"name": "Behance", "url": "https://www.behance.net/{u}"},
]


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")

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

        # ---------- Check all platforms IN PARALLEL for speed ----------
        with ThreadPoolExecutor(max_workers=len(PLATFORMS)) as executor:
            future_to_platform = {
                executor.submit(check_url_exists, platform["url"].format(u=username)): platform["name"]
                for platform in PLATFORMS
            }

            for future in as_completed(future_to_platform):
                platform_name = future_to_platform[future]
                checked_count += 1
                try:
                    exists = future.result()
                    if exists:
                        found_on.append(platform_name)
                except Exception:
                    pass  # treat any failure as "not found" on that platform

        # Sort alphabetically for consistent display
        found_on.sort()

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
        with urllib.request.urlopen(req, timeout=4) as resp:
            return resp.status == 200
    except Exception:
        return False


def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_dict)
    }