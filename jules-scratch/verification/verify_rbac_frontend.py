from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Login
        page.goto("http://localhost:3002/login")
        page.get_by_placeholder("Username").fill("admin")
        page.get_by_placeholder("Password").fill("admin123")
        page.get_by_role("button", name="Login").click()

        # Wait for navigation to the dashboard
        expect(page).to_have_url("http://localhost:3002/", timeout=10000)
        expect(page.get_by_text("แดชบอร์ด")).to_be_visible()

        # 2. Navigate to User Management
        page.get_by_role("link", name="จัดการผู้ใช้").click()
        expect(page.get_by_role("heading", name="User Management")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/user-management-page.png")

        # 3. Navigate to Role Management
        page.get_by_role("link", name="จัดการสิทธิ์").click()
        expect(page.get_by_role("heading", name="Role Management")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/role-management-page.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)