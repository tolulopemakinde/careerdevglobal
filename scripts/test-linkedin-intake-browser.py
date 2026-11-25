import json
import secrets
import uuid
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright


def run(page):
    email = f"linkedin-intake-{uuid.uuid4().hex}@example.com"
    password = secrets.token_urlsafe(24)
    target = "http://127.0.0.1:3000/career-intelligence"
    creates = []
    edits = []
    inference = []

    def capture(request):
        parsed = urlsplit(request.url)
        if parsed.path.endswith("/rpc/create_client_service_request") and request.method == "POST":
            creates.append(request.post_data_json)
        if parsed.path.endswith("/service_requests") and request.method == "PATCH":
            edits.append((parse_qs(parsed.query), request.post_data_json))
        if "/functions/v1/" in parsed.path:
            inference.append(parsed.path)

    page.on("request", capture)
    page.goto(target, wait_until="networkidle")
    page.get_by_label("Full name", exact=True).fill("Synthetic LinkedIn browser test")
    page.get_by_label("Email", exact=True).fill(email)
    page.get_by_label("Password", exact=True).fill(password)
    page.get_by_role("button", name="Create Secure Account").click()
    expect(page.get_by_text("Signed in securely as")).to_be_visible()

    page.get_by_label("What service do you need?").select_option("LinkedIn Profile Optimization")
    page.get_by_label("What are you trying to achieve?").fill("Improve my synthetic professional profile")
    page.get_by_label("Target role or industry").fill("Operations analyst")
    page.get_by_label("Preferred tone").fill("Technical")
    page.get_by_label("Current headline, About, or experience").fill("Synthetic headline\nSynthetic work evidence")

    def save_and_reload():
        page.get_by_role("button", name="Save LinkedIn intake").click()
        expect(page.get_by_role("status").filter(has_text="LinkedIn intake saved")).to_be_visible()
        page.reload(wait_until="networkidle")
        expect(page.get_by_label("What service do you need?")).to_have_value("LinkedIn Profile Optimization")

    save_and_reload()
    expect(page.get_by_label("Target role or industry")).to_have_value("Operations analyst")
    expect(page.get_by_label("Preferred tone")).to_have_value("Technical")
    expect(page.get_by_label("Current headline, About, or experience")).to_have_value("Synthetic headline\nSynthetic work evidence")

    page.get_by_label("Preferred tone").fill("Clear and approachable")
    page.get_by_label("Target role or industry").fill("")
    save_and_reload()
    expect(page.get_by_label("Preferred tone")).to_have_value("Clear and approachable")
    expect(page.get_by_label("Target role or industry")).to_have_value("")

    assert len(creates) == 1, "Expected one request creation"
    assert len(edits) == 1, "Expected one update to the original request"
    assert edits[0][0].get("id", [""])[0].startswith("eq."), "Expected a scoped update by request ID"
    content = json.loads(edits[0][1]["original_request"].split("[CareerDev LinkedIn intake]\n", 1)[1])
    assert content["Preferred tone"] == "Clear and approachable"
    assert "Target role or industry" not in content
    assert not inference, "Saving LinkedIn intake sent an inference request"
    print("LinkedIn browser flow passed using real local Supabase Auth and PostgREST.")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        run(browser.new_page())
        browser.close()
