
from playwright.sync_api import sync_playwright
import time

def verify_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Login/Bypass Auth (Simulate by setting cookies if possible, or just hit public page if auth not strict)
        # Assuming dev environment might need auth.
        # Since I can't easily login via UI without credentials, I'll rely on the fact that I'm in a dev environment.
        # However, NextAuth usually protects /dashboard.
        # I might need to bypass auth or use a mock session if possible.
        # But this is a live dev server.

        # Let's try to hit /settings first. If redirected to login, I can't verify easily without credentials.
        # But I can modify the code to bypass auth for verification or I can try to register a new user.

        print("Navigating to register...")
        page.goto("http://localhost:3000/register")

        # Fill registration
        page.fill('input[name="name"]', "Test User")
        page.fill('input[name="email"]', "test@example.com")
        page.fill('input[name="password"]', "password123")
        page.click('button[type="submit"]')

        # Wait for redirect or success
        time.sleep(2)

        print("Navigating to settings...")
        page.goto("http://localhost:3000/settings")

        # Take screenshot of Settings (Pace Factor + Tags)
        page.screenshot(path="verification/settings.png")
        print("Settings screenshot taken.")

        # Create a tag
        page.fill('input[placeholder="Nouveau tag..."]', "RPG")
        page.click('button:has-text("Ajouter")')
        time.sleep(1)
        page.screenshot(path="verification/settings_with_tag.png")

        # Change pace
        # Interacting with slider in headless mode can be tricky, skipping for screenshot purposes but visible in UI

        print("Navigating to dashboard...")
        page.goto("http://localhost:3000/dashboard")
        page.screenshot(path="verification/dashboard.png")

        print("Navigating to calendar...")
        page.goto("http://localhost:3000/calendar")
        page.screenshot(path="verification/calendar.png")

        browser.close()

if __name__ == "__main__":
    verify_features()
