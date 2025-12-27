import { test, expect } from '@playwright/test';

test.describe('Search Games', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the search API or navigation if needed
        // For now, we assume simple navigation to search page
        await page.goto('/search');
    });

    test('should display search results with + button', async ({ page }) => {
        // Type in search box
        await page.fill('input[type="search"]', 'Zelda');
        await page.press('input[type="search"]', 'Enter');

        // Wait for results
        // Note: This relies on real backend or mocked API. 
        // If we can't reliably hit backend, we might assume some results are pre-hydrated or use a specific test query.

        // Check for Game Card
        const gameCard = page.locator('.group').first();
        await expect(gameCard).toBeVisible();

        // Check for + Button (should be visible without hover now)
        const plusButton = gameCard.locator('button');
        await expect(plusButton).toBeVisible();
    });

    test('should navigate to game page on card click', async ({ page }) => {
        await page.fill('input[type="search"]', 'Mario');
        await page.press('input[type="search"]', 'Enter');

        const gameCard = page.locator('.group').first();
        await expect(gameCard).toBeVisible();

        // Click the card (anchor tag inside)
        await gameCard.click();

        // Check URL or Page Content
        await expect(page).toHaveURL(/\/game\//);
    });
});
