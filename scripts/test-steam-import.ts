
async function main() {
  const TEST_STEAM_ID = process.env.TEST_STEAM_ID;
  if (!TEST_STEAM_ID) {
    console.error('Error: TEST_STEAM_ID environment variable is not set.');
    // We expect it to be passed
  }

  // Add limit=10 to avoid timeout
  const url = `http://localhost:3000/api/test/steam-import?steamId=${TEST_STEAM_ID || ''}&limit=10`;
  console.log(`Testing Steam Import Endpoint: ${url}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));

    if (response.ok && data.success) {
      console.log('✅ Steam Import Test Passed');
    } else {
      console.error('❌ Steam Import Test Failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error fetching endpoint:', error);
    process.exit(1);
  }
}

main();
