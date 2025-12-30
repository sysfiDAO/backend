export const DAO_FACTORY_ABI = [
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "_ethDaoCreationFee",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "_tokenDaoCreationFee",
					"type": "uint256"
				},
				{
					"internalType": "address",
					"name": "_feeToken",
					"type": "address"
				},
				{
					"internalType": "address",
					"name": "_feeCollector",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "_minTimelockHours",
					"type": "uint256"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "owner",
					"type": "address"
				}
			],
			"name": "OwnableInvalidOwner",
			"type": "error"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "account",
					"type": "address"
				}
			],
			"name": "OwnableUnauthorizedAccount",
			"type": "error"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": true,
					"internalType": "address",
					"name": "daoAddress",
					"type": "address"
				},
				{
					"indexed": true,
					"internalType": "address",
					"name": "creator",
					"type": "address"
				},
				{
					"indexed": false,
					"internalType": "address",
					"name": "tokenAddress",
					"type": "address"
				},
				{
					"indexed": false,
					"internalType": "enum DAOFactory.Genre",
					"name": "genre",
					"type": "uint8"
				},
				{
					"indexed": false,
					"internalType": "string",
					"name": "daoName",
					"type": "string"
				},
				{
					"indexed": false,
					"internalType": "enum DAOFactory.PaymentMethod",
					"name": "paymentMethod",
					"type": "uint8"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "threshold",
					"type": "uint256"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "timelockPeriodHours",
					"type": "uint256"
				}
			],
			"name": "DAOCreated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "newFee",
					"type": "uint256"
				}
			],
			"name": "EthFeeUpdated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "address",
					"name": "newFeeCollector",
					"type": "address"
				}
			],
			"name": "FeeCollectorUpdated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "address",
					"name": "newFeeToken",
					"type": "address"
				}
			],
			"name": "FeeTokenUpdated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "newMinTimelock",
					"type": "uint256"
				}
			],
			"name": "MinTimelockUpdated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": true,
					"internalType": "address",
					"name": "previousOwner",
					"type": "address"
				},
				{
					"indexed": true,
					"internalType": "address",
					"name": "newOwner",
					"type": "address"
				}
			],
			"name": "OwnershipTransferred",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "newFee",
					"type": "uint256"
				}
			],
			"name": "TokenFeeUpdated",
			"type": "event"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "quorum",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "threshold",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "votingPeriodHours",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "timelockPeriodHours",
					"type": "uint256"
				},
				{
					"internalType": "address",
					"name": "tokenAddress",
					"type": "address"
				},
				{
					"internalType": "enum DAOFactory.Genre",
					"name": "genre",
					"type": "uint8"
				},
				{
					"internalType": "string",
					"name": "imgUrl",
					"type": "string"
				},
				{
					"internalType": "string",
					"name": "daoName",
					"type": "string"
				},
				{
					"internalType": "enum DAOFactory.PaymentMethod",
					"name": "paymentMethod",
					"type": "uint8"
				}
			],
			"name": "createDAO",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "ethDaoCreationFee",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "feeCollector",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "feeToken",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "daoAddr",
					"type": "address"
				}
			],
			"name": "getDAO",
			"outputs": [
				{
					"components": [
						{
							"internalType": "address",
							"name": "daoAddress",
							"type": "address"
						},
						{
							"internalType": "address",
							"name": "tokenAddress",
							"type": "address"
						},
						{
							"internalType": "enum DAOFactory.Genre",
							"name": "genre",
							"type": "uint8"
						},
						{
							"internalType": "string",
							"name": "daoName",
							"type": "string"
						},
						{
							"internalType": "string",
							"name": "imageUrl",
							"type": "string"
						},
						{
							"internalType": "uint256",
							"name": "threshold",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "quorum",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "votingPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "timelockPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "createdAt",
							"type": "uint256"
						}
					],
					"internalType": "struct DAOFactory.DAOInfo",
					"name": "",
					"type": "tuple"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "enum DAOFactory.Genre",
					"name": "genre",
					"type": "uint8"
				},
				{
					"internalType": "uint256",
					"name": "offset",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "limit",
					"type": "uint256"
				}
			],
			"name": "getDAOsByGenre",
			"outputs": [
				{
					"components": [
						{
							"internalType": "address",
							"name": "daoAddress",
							"type": "address"
						},
						{
							"internalType": "address",
							"name": "tokenAddress",
							"type": "address"
						},
						{
							"internalType": "enum DAOFactory.Genre",
							"name": "genre",
							"type": "uint8"
						},
						{
							"internalType": "string",
							"name": "daoName",
							"type": "string"
						},
						{
							"internalType": "string",
							"name": "imageUrl",
							"type": "string"
						},
						{
							"internalType": "uint256",
							"name": "threshold",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "quorum",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "votingPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "timelockPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "createdAt",
							"type": "uint256"
						}
					],
					"internalType": "struct DAOFactory.DAOInfo[]",
					"name": "",
					"type": "tuple[]"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "offset",
					"type": "uint256"
				},
				{
					"internalType": "uint256",
					"name": "limit",
					"type": "uint256"
				}
			],
			"name": "getDeployedDAOs",
			"outputs": [
				{
					"components": [
						{
							"internalType": "address",
							"name": "daoAddress",
							"type": "address"
						},
						{
							"internalType": "address",
							"name": "tokenAddress",
							"type": "address"
						},
						{
							"internalType": "enum DAOFactory.Genre",
							"name": "genre",
							"type": "uint8"
						},
						{
							"internalType": "string",
							"name": "daoName",
							"type": "string"
						},
						{
							"internalType": "string",
							"name": "imageUrl",
							"type": "string"
						},
						{
							"internalType": "uint256",
							"name": "threshold",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "quorum",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "votingPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "timelockPeriodHours",
							"type": "uint256"
						},
						{
							"internalType": "uint256",
							"name": "createdAt",
							"type": "uint256"
						}
					],
					"internalType": "struct DAOFactory.DAOInfo[]",
					"name": "",
					"type": "tuple[]"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "getTotalDAOs",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "minTimelockHours",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "owner",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "renounceOwnership",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "tokenDaoCreationFee",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "newOwner",
					"type": "address"
				}
			],
			"name": "transferOwnership",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "_newFee",
					"type": "uint256"
				}
			],
			"name": "updateEthFee",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_newFeeCollector",
					"type": "address"
				}
			],
			"name": "updateFeeCollector",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_newFeeToken",
					"type": "address"
				}
			],
			"name": "updateFeeToken",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "_newMinTimelock",
					"type": "uint256"
				}
			],
			"name": "updateMinTimelock",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "_newFee",
					"type": "uint256"
				}
			],
			"name": "updateTokenFee",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"stateMutability": "payable",
			"type": "receive"
		}
	]


    // Genre enum mapping
export const GENRE_MAP = {
  0: 'NFT',
  1: 'GAMING',
  2: 'COMMUNITY',
  3: 'DEFI',
  4: 'AI',
  5: 'DEGEN',
  6: 'MEMECOIN',
  7: 'RWA',
  8: 'DEPIN',
  9: 'SOCIALFI',
  10: 'METAVERSE',
  11: 'OTHER',
};

export const PAYMENT_METHOD_MAP = {
  0: 'ETH',
  1: 'TOKEN',
};