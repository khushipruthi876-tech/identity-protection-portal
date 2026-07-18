import json
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("SearchHistory")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET"
}


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
        params = event.get("queryStringParameters") or {}
        user_id = params.get("userId", "").strip()

        if not user_id:
            return response(400, {"error": "Missing userId parameter."})

        # ---------- Pull ALL history for this user ----------
        result = table.query(
            KeyConditionExpression=Key("userId").eq(user_id),
            ScanIndexForward=False
        )
        items = result.get("Items", [])

        # ---------- Separate breach checks and footprint scans ----------
        breach_checks = [i for i in items if i.get("scanType") != "footprint"]
        footprint_scans = [i for i in items if i.get("scanType") == "footprint"]

        # ---------- Aggregate breach data ----------
        total_breach_scans = len(breach_checks)
        total_breaches_found = sum(int(i.get("breachCount", 0)) for i in breach_checks)
        unique_breach_sources = set()
        for i in breach_checks:
            for b in i.get("breaches", []):
                unique_breach_sources.add(b)

        # ---------- Aggregate footprint data ----------
        total_footprint_scans = len(footprint_scans)
        unique_platforms_found = set()
        for i in footprint_scans:
            for p in i.get("platformsFound", []):
                unique_platforms_found.add(p)

        # ---------- Simple risk score formula ----------
        # Each unique breach source = 12 points, each exposed platform = 5 points, capped at 100
        risk_score = min(100, (len(unique_breach_sources) * 12) + (len(unique_platforms_found) * 5))

        if risk_score >= 70:
            risk_level = "High"
        elif risk_score >= 35:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        # ---------- Recommendations based on findings ----------
        recommendations = []
        if len(unique_breach_sources) > 0:
            recommendations.append("Change passwords for any accounts tied to the breached services listed below.")
            recommendations.append("Enable two-factor authentication (2FA) on your most important accounts (email, banking).")
        if len(unique_platforms_found) > 0:
            recommendations.append("Review privacy settings on the platforms where your username was found.")
        if len(unique_breach_sources) == 0 and len(unique_platforms_found) == 0:
            recommendations.append("No major exposure found. Continue practicing good password hygiene.")
        recommendations.append("Avoid reusing the same password across multiple sites.")

        report = {
            "userId": user_id,
            "riskScore": risk_score,
            "riskLevel": risk_level,
            "totalBreachScans": total_breach_scans,
            "totalBreachesFound": total_breaches_found,
            "uniqueBreachSources": sorted(list(unique_breach_sources)),
            "totalFootprintScans": total_footprint_scans,
            "uniquePlatformsFound": sorted(list(unique_platforms_found)),
            "recommendations": recommendations
        }

        return response(200, report)

    except Exception as e:
        return response(500, {"error": f"Something went wrong: {str(e)}"})


def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_dict, default=decimal_default)
    }


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError
