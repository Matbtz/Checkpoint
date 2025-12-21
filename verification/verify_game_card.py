
from playwright.sync_api import Page, expect, sync_playwright

def verify_game_card(page: Page):
    # Navigate to the test page
    page.goto("http://localhost:3000/test-game-card")

    # Wait for the cards to render
    page.wait_for_selector(".group.relative")

    # Take a screenshot
    page.screenshot(path="verification/game_card_verification.png", full_page=True)

    # We can also assert styles via JS evaluation if needed, but screenshot is primary
    cards = page.locator(".group.relative")
    expect(cards).to_have_count(3)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_game_card(page)
        finally:
            browser.close()
