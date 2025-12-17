
from playwright.sync_api import Page, expect, sync_playwright

def verify_game_card_metadata(page: Page):
    # 1. Login
    page.goto("http://localhost:3001/login")
    page.fill("input[name='email']", "testuser@example.com")
    page.fill("input[name='password']", "password123")
    page.click("button[type='submit']")

    # Wait for dashboard
    page.wait_for_url("http://localhost:3001/dashboard")

    # 2. Check Game Card
    # Look for the metadata row
    # The text should be "2023" and "Unknown Studio" since we didn't provide developer

    # Wait for the game card to appear
    expect(page.get_by_text("Test Game")).to_be_visible()

    # Find the year
    year_element = page.get_by_text("2023", exact=True)
    expect(year_element).to_be_visible()

    # Take screenshot
    page.screenshot(path="/home/jules/verification/game_card_metadata.png")

    # Locate the container
    container = page.locator("div.flex.items-center.select-none.font-inter").first
    expect(container).to_be_visible()

    # Verify Year styles
    year_span = container.locator("span").first
    expect(year_span).to_have_class("text-[11px] font-extralight text-zinc-300 tracking-wider")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_game_card_metadata(page)
            print("Verification script completed successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
