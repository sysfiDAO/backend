import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const BASE_SEPOLIA_CHAIN_ID = 84532;

const testAPI = async () => {
  console.log('🧪 Testing Backend API for Base Sepolia...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health:', health.data.message);
    console.log('');

    // Test 2: Get Stats for Base Sepolia
    console.log('2️⃣ Testing Get Stats...');
    const stats = await axios.get(`${API_BASE}/stats`);
    const baseSepoliaStats = stats.data.data.chainStats.find(
      stat => stat.chainId === BASE_SEPOLIA_CHAIN_ID
    );
    if (baseSepoliaStats) {
      console.log('✅ Base Sepolia Total DAOs:', baseSepoliaStats.totalDAOs);
    }
    console.log('');

    // Test 3: Get DAOs from Base Sepolia
    console.log('3️⃣ Testing Get DAOs for Base Sepolia...');
    const daos = await axios.get(`${API_BASE}/daos/chain/${BASE_SEPOLIA_CHAIN_ID}?offset=0&limit=100`);
    console.log(`✅ Fetched: ${daos.data.count} DAOs (offset 0)`);
    
    if (daos.data.data.length > 0) {
      console.log('\n📋 First 3 DAOs:');
      daos.data.data.slice(0, 3).forEach((dao, index) => {
        console.log(`\n${index + 1}. ${dao.daoName}`);
        console.log(`   Address: ${dao.daoAddress}`);
        console.log(`   Genre: ${dao.genre}`);
        console.log(`   Quorum: ${dao.quorum}%`);
      });
    }
    
    // Test pagination - get second batch
    if (baseSepoliaStats && baseSepoliaStats.totalDAOs > 100) {
      console.log('\n4️⃣ Testing Pagination (offset 100)...');
      const daos2 = await axios.get(`${API_BASE}/daos/chain/${BASE_SEPOLIA_CHAIN_ID}?offset=100&limit=100`);
      console.log(`✅ Fetched: ${daos2.data.count} DAOs (offset 100)`);
    }
    
    // Test pagination - get third batch
    if (baseSepoliaStats && baseSepoliaStats.totalDAOs > 200) {
      console.log('\n5️⃣ Testing Pagination (offset 200)...');
      const daos3 = await axios.get(`${API_BASE}/daos/chain/${BASE_SEPOLIA_CHAIN_ID}?offset=200&limit=100`);
      console.log(`✅ Fetched: ${daos3.data.count} DAOs (offset 200)`);
    }
    
    console.log('\n🎉 All Base Sepolia tests passed!');
  } catch (error) {
    console.error('\n❌ API Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
};

testAPI();