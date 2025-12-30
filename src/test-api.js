import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const BASE_SEPOLIA_CHAIN_ID = 84532; // Base Sepolia testnet

const testAPI = async () => {
  console.log('🧪 Testing Backend API for Base Sepolia...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health:', health.data.message);
    console.log('');

    // Test 2: Get Chains (filter for testnet)
    console.log('2️⃣ Testing Get Chains...');
    const chains = await axios.get(`${API_BASE}/chains`);
    const testnets = chains.data.data.filter(chain => chain.testnet);
    console.log('✅ Testnets Found:', testnets.length);
    const baseSepolia = testnets.find(chain => chain.id === BASE_SEPOLIA_CHAIN_ID);
    if (baseSepolia) {
      console.log('✅ Base Sepolia:', baseSepolia.name);
      console.log('   Factory Address:', baseSepolia.factoryAddress || 'Not configured');
    }
    console.log('');

    // Test 3: Get Stats for Base Sepolia
    console.log('3️⃣ Testing Get Stats...');
    const stats = await axios.get(`${API_BASE}/stats`);
    const baseSepoliaStats = stats.data.data.chainStats.find(
      stat => stat.chainId === BASE_SEPOLIA_CHAIN_ID
    );
    if (baseSepoliaStats) {
      console.log('✅ Base Sepolia Stats:', baseSepoliaStats);
    } else {
      console.log('⚠️  Base Sepolia not configured or no DAOs found');
    }
    console.log('');

    // Test 4: Get DAOs from Base Sepolia
    console.log('4️⃣ Testing Get DAOs for Base Sepolia...');
    const daos = await axios.get(`${API_BASE}/daos/chain/${BASE_SEPOLIA_CHAIN_ID}`);
    console.log(`✅ Total DAOs on Base Sepolia: ${daos.data.count}`);
    
    if (daos.data.data.length > 0) {
      console.log('\n📋 First 3 DAOs:');
      daos.data.data.slice(0, 3).forEach((dao, index) => {
        console.log(`\n${index + 1}. ${dao.daoName}`);
        console.log(`   Address: ${dao.daoAddress}`);
        console.log(`   Genre: ${dao.genre}`);
        console.log(`   Created: ${new Date(dao.createdAt * 1000).toLocaleDateString()}`);
      });
    }
    console.log('');

    console.log('🎉 All Base Sepolia tests passed!');
  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
};

testAPI();