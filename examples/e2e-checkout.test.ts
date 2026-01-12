import { test } from '../src/dsl/TestCollector';

/**
 * Example: Complete e-commerce checkout flow
 */
test('User can complete checkout process', async ({ agent }) => {
    // 1. Navigate to product page
    await agent.navigate('https://example-shop.com/products');

    // 2. Search for product
    await agent.fill('search box', 'laptop');
    await agent.press('Enter');
    await agent.expect('search results should be displayed');

    // 3. Select a product
    await agent.click('first product in results');
    await agent.expect('product details should be visible');

    // 4. Add to cart
    await agent.click('add to cart button');
    await agent.expect('item added to cart notification should appear');

    // 5. Go to cart
    await agent.click('cart icon');
    await agent.expect('cart page should be displayed');
    await agent.expect('product should be in cart');

    // 6. Proceed to checkout
    await agent.click('proceed to checkout button');
    await agent.expect('checkout page should be displayed');

    // 7. Fill shipping information
    await agent.fill('full name field', 'John Doe');
    await agent.fill('address field', '123 Main St');
    await agent.fill('city field', 'New York');
    await agent.fill('zip code field', '10001');
    await agent.fill('phone number field', '555-1234');

    // 8. Continue to payment
    await agent.click('continue to payment button');
    await agent.expect('payment form should be visible');

    // 9. Fill payment information
    await agent.fill('card number field', '4111111111111111');
    await agent.fill('expiry date field', '12/25');
    await agent.fill('cvv field', '123');

    // 10. Place order
    await agent.click('place order button');

    // 11. Verify order confirmation
    await agent.expect('order confirmation page should be displayed');
    await agent.expect('order number should be visible');
    await agent.expect('thank you message should appear');
}, {
    tags: ['e2e', 'checkout', 'critical'],
    timeout: 120000, // 2 minutes for full flow
});

/**
 * Example: Add multiple items to cart
 */
test('User can add multiple items to cart', async ({ agent }) => {
    await agent.navigate('https://example-shop.com/products');

    // Add first item
    await agent.click('first product');
    await agent.click('add to cart button');
    await agent.click('continue shopping button');

    // Add second item
    await agent.click('second product');
    await agent.click('add to cart button');

    // Verify cart
    await agent.click('cart icon');
    await agent.expect('cart should contain 2 items');
    await agent.expect('total price should be calculated correctly');
}, {
    tags: ['cart', 'e2e'],
});

/**
 * Example: Apply discount code
 */
test('User can apply discount code', async ({ agent }) => {
    // Assume item is already in cart
    await agent.navigate('https://example-shop.com/cart');

    // Get original price
    await agent.screenshot('before-discount');

    // Apply discount code
    await agent.fill('discount code field', 'SAVE20');
    await agent.click('apply discount button');

    // Verify discount applied
    await agent.expect('discount should be applied');
    await agent.expect('total price should be reduced');
    await agent.expect('discount amount should be visible');

    await agent.screenshot('after-discount');
}, {
    tags: ['cart', 'discount'],
});
