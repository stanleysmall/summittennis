const { test, expect } = require('@playwright/test');

test.describe('Update Profile Page', () => {

  test('Shows error if no credentials are provided', async ({ page }) => {
    // Go to the profile page without ?id= or ?password=
    await page.goto('file://' + __dirname + '/../update_profile.html');
    
    // Check that the alert popped up
    const alert = page.locator('.alert-danger');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Invalid Link');
    
    // Ensure the loading spinner hides
    await expect(page.locator('#loading')).toBeHidden();
  });

  test('Loads user data correctly with mocked API', async ({ page }) => {
    // Intercept the fetch call to Google Apps Script and mock the response
    await page.route('**/*', route => {
      if (route.request().url().includes('action=read')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            user: { first_name: 'Test', last_name: 'Player', phone: '3035551234', email: 'test@test.com', ladder_rank: 5, rating: '4.0' },
            courts: [{ key: 'breck', name: 'Breck', indoor: true, outdoor: true }],
            rounds: []
          })
        });
      } else {
        route.continue(); // Let CSS and other scripts load normally
      }
    });

    // Go to the page WITH credentials
    await page.goto('file://' + __dirname + '/../update_profile.html?id=123&password=abc');

    // Wait for the form to appear
    await expect(page.locator('#profileForm')).toBeVisible();

    // Verify the inputs were filled correctly by our mock API
    await expect(page.locator('input[name="first_name"]')).toHaveValue('Test');
    await expect(page.locator('input[name="phone"]')).toHaveValue('3035551234');
    
    // Verify the badge loaded
    await expect(page.locator('#disp-rank')).toHaveText('5');
  });
});