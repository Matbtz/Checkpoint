from playwright.sync_api import sync_playwright

def verify_dashboard_navigation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Visit Home Page
            page.goto("http://localhost:3000/")
            page.wait_for_load_state("networkidle")

            # Take screenshot of Home Page
            page.screenshot(path="verification/home_page.png")
            print("Home page screenshot taken.")

            # 2. Check for Navbar
            logo = page.get_by_text("Checkpoint")
            if logo.is_visible():
                print("Navbar logo found.")
            else:
                print("Navbar logo NOT found.")

            # 3. Check for Sign In link in Navbar specifically
            # We can scope it to the nav element
            navbar = page.locator("nav")
            sign_in_nav = navbar.get_by_role("link", name="Sign In")
            if sign_in_nav.is_visible():
                print("Navbar Sign In link found.")
            else:
                print("Navbar Sign In link NOT found.")

            # 4. Visit Login Page to see Navbar there too
            page.goto("http://localhost:3000/login")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="verification/login_page.png")
            print("Login page screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_dashboard_navigation()
