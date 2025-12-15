from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Verify Login Page
        try:
            print("Navigating to login page...")
            page.goto("http://localhost:3000/login")
            page.wait_for_selector("text=Sign in with Steam")
            print("Found 'Sign in with Steam' button on login page.")
            page.screenshot(path="verification/login_page.png")
            print("Screenshot saved to verification/login_page.png")
        except Exception as e:
            print(f"Error on login page: {e}")

        # 2. Verify Register Page
        try:
            print("Navigating to register page...")
            page.goto("http://localhost:3000/register")
            # Register page is mostly the form, just check it loads
            page.wait_for_selector("text=Create an account")
            print("Register page loaded.")
            page.screenshot(path="verification/register_page.png")
            print("Screenshot saved to verification/register_page.png")
        except Exception as e:
            print(f"Error on register page: {e}")

        # 3. Verify Dashboard Settings (Need to login first, but we can't easily mock auth here without seeding DB)
        # However, I can try to access the settings page directly and see if it redirects to login (since I'm not logged in).
        # But wait, the task was to ADD the button to settings.
        # Since I cannot easily login with a real account in this sandbox without seeding a user,
        # I will check if I can mock the session or just rely on the code review for that part.
        # BUT, I can try to register a user!

        try:
            print("Registering a new user...")
            page.goto("http://localhost:3000/register")
            page.fill("input[name='name']", "Test User")
            page.fill("input[name='email']", "test@example.com")
            page.fill("input[name='password']", "password123")

            # Click register (Wait for navigation)
            # RegisterForm does router.push('/login') on success
            with page.expect_navigation():
                page.click("button[type='submit']")

            print("Registered. Now logging in...")
            # Should be on login page now
            page.fill("input[name='email']", "test@example.com")
            page.fill("input[name='password']", "password123")

            # Click sign in
            with page.expect_navigation():
                page.click("button:text('Sign in')") # The credentials sign in button

            print("Logged in. Navigating to settings...")
            # Should be on dashboard or home.
            # Navigate to settings (assuming there is a link or I know the URL)
            # The URL for settings is likely /settings or /dashboard/settings?
            # Looking at file structure: app/settings/page.tsx or app/dashboard/settings/page.tsx?
            # app/settings/page.tsx exists.

            page.goto("http://localhost:3000/settings")

            # Check for "Link Steam" button
            page.wait_for_selector("text=Connexions")
            page.wait_for_selector("text=Lier mon compte Steam")
            print("Found 'Lier mon compte Steam' button in settings.")

            page.screenshot(path="verification/settings_page.png")
            print("Screenshot saved to verification/settings_page.png")

        except Exception as e:
             print(f"Error during full flow: {e}")

        browser.close()

if __name__ == "__main__":
    verify_changes()
