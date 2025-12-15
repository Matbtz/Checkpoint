from playwright.sync_api import sync_playwright

def verify_mobile_navigation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 375, "height": 667})

        try:
            # 1. Visit Home Page
            page.goto("http://localhost:3000/")
            page.wait_for_load_state("networkidle")

            # Take screenshot of Home Page Mobile
            page.screenshot(path="verification/mobile_home_page.png")
            print("Mobile home page screenshot taken.")

            # 2. Check for Navbar Logo
            logo = page.get_by_text("Checkpoint")
            if logo.is_visible():
                print("Mobile Navbar logo found.")
            else:
                print("Mobile Navbar logo NOT found.")

            # 3. Check for Sign In link in Navbar specifically
            # We locate the nav element first
            navbar = page.locator("nav")
            # In mobile view, we expect at least one Sign In link to be visible (the mobile one).
            # Note: The desktop one has 'hidden sm:flex', so it should be hidden.
            # However, Playwright is_visible() checks if it's painted. 'hidden' class does display: none.

            sign_in_links = navbar.get_by_role("link", name="Sign In").all()
            visible_links = [link for link in sign_in_links if link.is_visible()]

            if len(visible_links) > 0:
                print(f"Found {len(visible_links)} visible Sign In link(s) in Navbar.")
            else:
                print("No visible Sign In link found in Navbar.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_mobile_navigation()
