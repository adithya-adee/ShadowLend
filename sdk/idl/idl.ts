export type ShadowLend = {
  address: "EKPFnwquVeawEBxn5iaNw9NXpyh1Axto7P3C1EHBXScy";
  metadata: {
    name: "shadowlend_program";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Arcium & Anchor";
  };
  instructions: [
    {
      name: "borrow";
      docs: [
        "Initiates a borrow request with confidential health check.",
        "",
        "Queues an MPC computation to verify the health factor remains above",
        "the liquidation threshold. If approved, internal credit is increased.",
        "",
        "# Arguments",
        "* `computation_offset` - Unique identifier for this Arcium computation",
        "* `amount` - Encrypted token amount to borrow",
      ];
      discriminator: [228, 253, 131, 202, 207, 116, 89, 18];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "borrow_callback";
      docs: [
        "Callback invoked by Arcium MXE after borrow health check completes.",
        "",
        "Verifies the MPC output and, if approved, updates encrypted debt and",
        "encrypted internal balance. No token transfer occurs here (V3).",
        "",
        "# Arguments",
        "* `output` - Contains: new_state, approval_status",
      ];
      discriminator: [191, 62, 124, 139, 185, 151, 38, 244];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "BorrowOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
    {
      name: "close_pool";
      docs: ["Closes the lending pool (admin only)"];
      discriminator: [140, 189, 209, 23, 239, 62, 239, 11];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
          relations: ["pool"];
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "deposit";
      docs: [
        "Deposits collateral tokens and queues confidential balance update.",
        "",
        "Transfers tokens to the collateral vault and initiates an MPC computation",
        "to update the user's encrypted deposit balance.",
        "",
        "# Arguments",
        "* `computation_offset` - Unique identifier for this Arcium computation",
        "* `amount` - Token amount to deposit",
        "* `user_pubkey` - User's X25519 public key for output encryption",
        "* `user_nonce` - Nonce for encryption freshness",
      ];
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "collateral_mint";
        },
        {
          name: "user_token_account";
          docs: ["User's token account (source of deposit)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "collateral_mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "collateral_vault";
          docs: ["Pool's collateral vault"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "associated_token_program";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "deposit_callback";
      docs: [
        "Callback invoked by Arcium MXE after deposit computation completes.",
        "",
        "Verifies the MPC computation output signature and updates the user's",
        "encrypted deposit balance on-chain with the new encrypted value.",
        "",
        "# Arguments",
        "* `output` - Signed computation outputs from the MPC cluster",
      ];
      discriminator: [203, 84, 215, 177, 14, 39, 30, 203];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "DepositOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
    {
      name: "init_borrow_comp_def";
      docs: ["Initializes borrow computation definition"];
      discriminator: [23, 160, 202, 254, 35, 121, 45, 248];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "init_deposit_comp_def";
      docs: ["Initializes deposit computation definition"];
      discriminator: [115, 50, 97, 116, 222, 75, 121, 6];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "init_liquidate_comp_def";
      docs: ["Initializes liquidate computation definition"];
      discriminator: [173, 194, 178, 252, 128, 111, 75, 5];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "init_repay_comp_def";
      docs: ["Initializes repay computation definition"];
      discriminator: [48, 65, 238, 85, 56, 13, 161, 220];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "init_spend_comp_def";
      docs: ["Initializes spend computation definition"];
      discriminator: [165, 14, 98, 5, 161, 200, 231, 67];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "init_withdraw_comp_def";
      docs: ["Initializes withdraw computation definition"];
      discriminator: [123, 165, 129, 195, 92, 182, 226, 232];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "mxe_account";
          writable: true;
        },
        {
          name: "comp_def_account";
          writable: true;
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "initialize_pool";
      docs: [
        "Initializes the lending pool with risk parameters.",
        "",
        "Creates the pool account and configures LTV and liquidation thresholds.",
        "This is a one-time setup instruction.",
        "",
        "# Arguments",
        "* `ltv_bps` - Loan-to-Value ratio in basis points (7500 = 75%)",
        "* `liquidation_threshold` - Threshold for liquidation in basis points",
      ];
      discriminator: [95, 180, 10, 172, 84, 174, 232, 40];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "collateral_mint";
        },
        {
          name: "borrow_mint";
        },
        {
          name: "collateral_vault";
          docs: ["Collateral vault token account"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "borrow_vault";
          docs: ["Borrow vault token account"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "ltv_bps";
          type: "u16";
        },
        {
          name: "liquidation_threshold";
          type: "u16";
        },
      ];
    },
    {
      name: "liquidate";
      docs: [
        "Initiates a confidential liquidation.",
        "",
        "Liquidator transfers repayment tokens to escrow.",
        "MPC verifies if user is unhealthy. If so, seizes collateral.",
        "If healthy, refund.",
      ];
      discriminator: [223, 179, 226, 125, 48, 46, 39, 74];
      accounts: [
        {
          name: "liquidator";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          docs: [
            "The user being liquidated",
            "We don't need their signature, just their account",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "borrow_mint";
        },
        {
          name: "collateral_mint";
        },
        {
          name: "liquidator_borrow_account";
          docs: ["Liquidator's token account (repaying debt)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "liquidator";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "borrow_mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "liquidator_collateral_account";
          docs: [
            "Liquidator's collateral account (receiving seized collateral)",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "liquidator";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "collateral_mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "borrow_vault";
          docs: ["Pool's borrow vault (receiving repayment)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "collateral_vault";
          docs: ["Pool's collateral vault (source of seized collateral)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "associated_token_program";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "liquidate_callback";
      docs: ["Callback for liquidation."];
      discriminator: [156, 82, 188, 61, 21, 86, 148, 80];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "liquidator_borrow_account";
          writable: true;
        },
        {
          name: "liquidator_collateral_account";
          writable: true;
        },
        {
          name: "borrow_vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "collateral_vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "LiquidateOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
    {
      name: "repay";
      docs: [
        "Repays borrowed tokens and queues confidential debt update.",
        "",
        "Transfers repayment tokens to the borrow vault and initiates an MPC",
        "computation to update the user's encrypted debt balance.",
        "",
        "# Arguments",
        "* `computation_offset` - Unique identifier for this Arcium computation",
        "* `amount` - Token amount to repay",
      ];
      discriminator: [234, 103, 67, 82, 208, 234, 219, 166];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "borrow_mint";
        },
        {
          name: "user_token_account";
          docs: ["Source of repayment tokens"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "borrow_mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "borrow_vault";
          docs: ["Pool's borrow vault (destination of repayment)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "associated_token_program";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "repay_callback";
      docs: [
        "Callback invoked by Arcium MXE after repayment computation completes.",
        "",
        "Verifies the MPC computation output and updates the user's encrypted",
        "debt balance with the new value after repayment.",
        "",
        "# Arguments",
        "* `output` - Signed computation outputs containing new encrypted state",
      ];
      discriminator: [104, 59, 108, 247, 253, 38, 145, 166];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "RepayOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
    {
      name: "spend";
      docs: [
        "Initiates a confidential spend.",
        "",
        "Checks if internal balance is sufficient and updates it.",
        "Queues computation.",
      ];
      discriminator: [242, 205, 255, 87, 101, 217, 245, 57];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          docs: [
            "PDA that owns the borrow vault, initialized to manage computation results",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
          docs: ["Mandatory Arcium system accounts for MPC execution"];
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "destination_token_account";
          docs: ["Destination account for the public token transfer"];
          writable: true;
        },
        {
          name: "borrow_vault";
          docs: ["Source vault containing the funds for public withdrawal"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "spend_callback";
      docs: [
        "Callback for confidential spend.",
        "",
        "Updates internal balance and transfers tokens if approved.",
      ];
      discriminator: [179, 68, 139, 51, 46, 97, 98, 112];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "destination_token_account";
          writable: true;
        },
        {
          name: "borrow_vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "SpendOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
    {
      name: "withdraw";
      docs: [
        "Initiates a withdrawal request with confidential health check.",
        "",
        "Queues an MPC computation to verify the health factor remains above",
        "the liquidation threshold after withdrawal. Token transfer occurs in callback.",
        "",
        "# Arguments",
        "* `computation_offset` - Unique identifier for this Arcium computation",
        "* `amount` - Token amount to withdraw",
      ];
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "sign_pda_account";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                ];
              },
            ];
          };
        },
        {
          name: "mxe_account";
        },
        {
          name: "mempool_account";
          writable: true;
        },
        {
          name: "executing_pool";
          writable: true;
        },
        {
          name: "computation_account";
          writable: true;
        },
        {
          name: "comp_def_account";
        },
        {
          name: "cluster_account";
          writable: true;
        },
        {
          name: "pool_account";
          writable: true;
          address: "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC";
        },
        {
          name: "clock_account";
          writable: true;
          address: "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot";
        },
        {
          name: "pool";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "collateral_mint";
        },
        {
          name: "user_token_account";
          docs: ["Destination for withdrawn tokens"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "collateral_mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "collateral_vault";
          docs: ["Pool's collateral vault (source of funds)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "associated_token_program";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
      ];
      args: [
        {
          name: "computation_offset";
          type: "u64";
        },
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "user_pubkey";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "user_nonce";
          type: "u128";
        },
      ];
    },
    {
      name: "withdraw_callback";
      docs: [
        "Callback invoked by Arcium MXE after withdraw health check completes.",
        "",
        "Verifies the MPC output and, if approved, updates encrypted collateral and",
        "transfers tokens from the collateral vault to user using PDA signer.",
        "",
        "# Arguments",
        "* `output` - Contains: new_state, approval_status (1/0), amount",
      ];
      discriminator: [75, 124, 115, 155, 173, 179, 40, 16];
      accounts: [
        {
          name: "arcium_program";
          address: "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";
        },
        {
          name: "comp_def_account";
        },
        {
          name: "mxe_account";
        },
        {
          name: "computation_account";
        },
        {
          name: "cluster_account";
        },
        {
          name: "instructions_sysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "user_obligation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 108, 105, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user_obligation.user";
                account: "UserObligation";
              },
              {
                kind: "account";
                path: "user_obligation.pool";
                account: "UserObligation";
              },
            ];
          };
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108, 95, 118, 50];
              },
            ];
          };
        },
        {
          name: "user_token_account";
          writable: true;
        },
        {
          name: "collateral_vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                ];
              },
              {
                kind: "account";
                path: "pool";
              },
            ];
          };
        },
        {
          name: "token_program";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "output";
          type: {
            defined: {
              name: "SignedComputationOutputs";
              generics: [
                {
                  kind: "type";
                  type: {
                    defined: {
                      name: "WithdrawOutput";
                    };
                  };
                },
              ];
            };
          };
        },
      ];
    },
  ];
  accounts: [
    {
      name: "ArciumSignerAccount";
      discriminator: [214, 157, 122, 114, 117, 44, 214, 74];
    },
    {
      name: "ClockAccount";
      discriminator: [152, 171, 158, 195, 75, 61, 51, 8];
    },
    {
      name: "Cluster";
      discriminator: [236, 225, 118, 228, 173, 106, 18, 60];
    },
    {
      name: "ComputationDefinitionAccount";
      discriminator: [245, 176, 217, 221, 253, 104, 172, 200];
    },
    {
      name: "FeePool";
      discriminator: [172, 38, 77, 146, 148, 5, 51, 242];
    },
    {
      name: "MXEAccount";
      discriminator: [103, 26, 85, 250, 179, 159, 17, 117];
    },
    {
      name: "Pool";
      discriminator: [241, 154, 109, 4, 17, 177, 109, 188];
    },
    {
      name: "UserObligation";
      discriminator: [82, 43, 188, 33, 64, 224, 73, 242];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "InvalidAmount";
      msg: "Invalid amount - must be greater than zero";
    },
    {
      code: 6001;
      name: "AbortedComputation";
      msg: "Computation aborted - MPC verification failed";
    },
    {
      code: 6002;
      name: "InsufficientLiquidity";
      msg: "Insufficient liquidity in pool";
    },
    {
      code: 6003;
      name: "BorrowNotApproved";
      msg: "Borrow not approved - health factor too low";
    },
    {
      code: 6004;
      name: "WithdrawNotApproved";
      msg: "Withdrawal not approved - would violate health factor";
    },
    {
      code: 6005;
      name: "MathOverflow";
      msg: "Math overflow";
    },
    {
      code: 6006;
      name: "ClusterNotSet";
      msg: "Cluster not set";
    },
    {
      code: 6007;
      name: "InvalidMint";
      msg: "Invalid Token Mint";
    },
    {
      code: 6008;
      name: "Unauthorized";
      msg: "Unauthorized";
    },
  ];
  types: [
    {
      name: "Activation";
      type: {
        kind: "struct";
        fields: [
          {
            name: "activation_epoch";
            type: {
              defined: {
                name: "Epoch";
              };
            };
          },
          {
            name: "deactivation_epoch";
            type: {
              defined: {
                name: "Epoch";
              };
            };
          },
        ];
      };
    },
    {
      name: "ArciumSignerAccount";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "BN254G2BLSPublicKey";
      type: {
        kind: "struct";
        fields: [
          {
            array: ["u8", 64];
          },
        ];
      };
    },
    {
      name: "BorrowOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "BorrowOutputStruct0";
              };
            };
          },
        ];
      };
    },
    {
      name: "BorrowOutputStruct0";
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
          {
            name: "field_1";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "CircuitSource";
      type: {
        kind: "enum";
        variants: [
          {
            name: "Local";
            fields: [
              {
                defined: {
                  name: "LocalCircuitSource";
                };
              },
            ];
          },
          {
            name: "OnChain";
            fields: [
              {
                defined: {
                  name: "OnChainCircuitSource";
                };
              },
            ];
          },
          {
            name: "OffChain";
            fields: [
              {
                defined: {
                  name: "OffChainCircuitSource";
                };
              },
            ];
          },
        ];
      };
    },
    {
      name: "ClockAccount";
      docs: ["An account storing the current network epoch"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "start_epoch";
            type: {
              defined: {
                name: "Epoch";
              };
            };
          },
          {
            name: "current_epoch";
            type: {
              defined: {
                name: "Epoch";
              };
            };
          },
          {
            name: "start_epoch_timestamp";
            type: {
              defined: {
                name: "Timestamp";
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "Cluster";
      type: {
        kind: "struct";
        fields: [
          {
            name: "td_info";
            type: {
              option: {
                defined: {
                  name: "NodeMetadata";
                };
              };
            };
          },
          {
            name: "authority";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "cluster_size";
            type: "u16";
          },
          {
            name: "activation";
            type: {
              defined: {
                name: "Activation";
              };
            };
          },
          {
            name: "max_capacity";
            type: "u64";
          },
          {
            name: "cu_price";
            type: "u64";
          },
          {
            name: "cu_price_proposals";
            type: {
              array: ["u64", 32];
            };
          },
          {
            name: "last_updated_epoch";
            type: {
              defined: {
                name: "Epoch";
              };
            };
          },
          {
            name: "nodes";
            type: {
              vec: {
                defined: {
                  name: "NodeRef";
                };
              };
            };
          },
          {
            name: "pending_nodes";
            type: {
              vec: "u32";
            };
          },
          {
            name: "bls_public_key";
            type: {
              defined: {
                name: "SetUnset";
                generics: [
                  {
                    kind: "type";
                    type: {
                      defined: {
                        name: "BN254G2BLSPublicKey";
                      };
                    };
                  },
                ];
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "ComputationDefinitionAccount";
      docs: ["An account representing a [ComputationDefinition] in a MXE."];
      type: {
        kind: "struct";
        fields: [
          {
            name: "finalization_authority";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "cu_amount";
            type: "u64";
          },
          {
            name: "definition";
            type: {
              defined: {
                name: "ComputationDefinitionMeta";
              };
            };
          },
          {
            name: "circuit_source";
            type: {
              defined: {
                name: "CircuitSource";
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "ComputationDefinitionMeta";
      docs: ["A computation definition for execution in a MXE."];
      type: {
        kind: "struct";
        fields: [
          {
            name: "circuit_len";
            type: "u32";
          },
          {
            name: "signature";
            type: {
              defined: {
                name: "ComputationSignature";
              };
            };
          },
        ];
      };
    },
    {
      name: "ComputationSignature";
      docs: [
        "The signature of a computation defined in a [ComputationDefinition].",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "parameters";
            type: {
              vec: {
                defined: {
                  name: "Parameter";
                };
              };
            };
          },
          {
            name: "outputs";
            type: {
              vec: {
                defined: {
                  name: "Output";
                };
              };
            };
          },
        ];
      };
    },
    {
      name: "DepositOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
        ];
      };
    },
    {
      name: "Epoch";
      docs: ["The network epoch"];
      type: {
        kind: "struct";
        fields: ["u64"];
      };
    },
    {
      name: "FeePool";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "LiquidateOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "LiquidateOutputStruct0";
              };
            };
          },
        ];
      };
    },
    {
      name: "LiquidateOutputStruct0";
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
          {
            name: "field_1";
            type: "u64";
          },
          {
            name: "field_2";
            type: "u64";
          },
          {
            name: "field_3";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "LocalCircuitSource";
      type: {
        kind: "enum";
        variants: [
          {
            name: "MxeKeygen";
          },
          {
            name: "MxeKeyRecoveryInit";
          },
          {
            name: "MxeKeyRecoveryFinalize";
          },
        ];
      };
    },
    {
      name: "MXEAccount";
      docs: ["A MPC Execution Environment."];
      type: {
        kind: "struct";
        fields: [
          {
            name: "cluster";
            type: {
              option: "u32";
            };
          },
          {
            name: "keygen_offset";
            type: "u64";
          },
          {
            name: "key_recovery_init_offset";
            type: "u64";
          },
          {
            name: "mxe_program_id";
            type: "pubkey";
          },
          {
            name: "authority";
            type: {
              option: "pubkey";
            };
          },
          {
            name: "utility_pubkeys";
            type: {
              defined: {
                name: "SetUnset";
                generics: [
                  {
                    kind: "type";
                    type: {
                      defined: {
                        name: "UtilityPubkeys";
                      };
                    };
                  },
                ];
              };
            };
          },
          {
            name: "fallback_clusters";
            type: {
              vec: "u32";
            };
          },
          {
            name: "rejected_clusters";
            type: {
              vec: "u32";
            };
          },
          {
            name: "computation_definitions";
            type: {
              vec: "u32";
            };
          },
          {
            name: "status";
            type: {
              defined: {
                name: "MxeStatus";
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "MxeStatus";
      docs: ["The status of an MXE."];
      type: {
        kind: "enum";
        variants: [
          {
            name: "Active";
          },
          {
            name: "Recovery";
          },
        ];
      };
    },
    {
      name: "NodeMetadata";
      docs: [
        "location as [ISO 3166-1 alpha-2](https://www.iso.org/iso-3166-country-codes.html) country code",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "ip";
            type: {
              array: ["u8", 4];
            };
          },
          {
            name: "peer_id";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "location";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "NodeRef";
      docs: [
        "A reference to a node in the cluster.",
        "The offset is to derive the Node Account.",
        "The current_total_rewards is the total rewards the node has received so far in the current",
        "epoch.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "offset";
            type: "u32";
          },
          {
            name: "current_total_rewards";
            type: "u64";
          },
          {
            name: "vote";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "OffChainCircuitSource";
      type: {
        kind: "struct";
        fields: [
          {
            name: "source";
            type: "string";
          },
          {
            name: "hash";
            type: {
              array: ["u8", 32];
            };
          },
        ];
      };
    },
    {
      name: "OnChainCircuitSource";
      type: {
        kind: "struct";
        fields: [
          {
            name: "is_completed";
            type: "bool";
          },
          {
            name: "upload_auth";
            type: "pubkey";
          },
        ];
      };
    },
    {
      name: "Output";
      docs: [
        "An output of a computation.",
        "We currently don't support encrypted outputs yet since encrypted values are passed via",
        "data objects.",
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "PlaintextBool";
          },
          {
            name: "PlaintextU8";
          },
          {
            name: "PlaintextU16";
          },
          {
            name: "PlaintextU32";
          },
          {
            name: "PlaintextU64";
          },
          {
            name: "PlaintextU128";
          },
          {
            name: "Ciphertext";
          },
          {
            name: "ArcisX25519Pubkey";
          },
          {
            name: "PlaintextFloat";
          },
          {
            name: "PlaintextPoint";
          },
          {
            name: "PlaintextI8";
          },
          {
            name: "PlaintextI16";
          },
          {
            name: "PlaintextI32";
          },
          {
            name: "PlaintextI64";
          },
          {
            name: "PlaintextI128";
          },
        ];
      };
    },
    {
      name: "Parameter";
      docs: [
        "A parameter of a computation.",
        "We differentiate between plaintext and encrypted parameters and data objects.",
        "Plaintext parameters are directly provided as their value.",
        "Encrypted parameters are provided as an offchain reference to the data.",
        "Data objects are provided as a reference to the data object account.",
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "PlaintextBool";
          },
          {
            name: "PlaintextU8";
          },
          {
            name: "PlaintextU16";
          },
          {
            name: "PlaintextU32";
          },
          {
            name: "PlaintextU64";
          },
          {
            name: "PlaintextU128";
          },
          {
            name: "Ciphertext";
          },
          {
            name: "ArcisX25519Pubkey";
          },
          {
            name: "ArcisSignature";
          },
          {
            name: "PlaintextFloat";
          },
          {
            name: "PlaintextI8";
          },
          {
            name: "PlaintextI16";
          },
          {
            name: "PlaintextI32";
          },
          {
            name: "PlaintextI64";
          },
          {
            name: "PlaintextI128";
          },
          {
            name: "PlaintextPoint";
          },
        ];
      };
    },
    {
      name: "Pool";
      docs: ["Global pool configuration"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            docs: ["Pool administrator"];
            type: "pubkey";
          },
          {
            name: "collateral_mint";
            docs: ["Collateral token mint"];
            type: "pubkey";
          },
          {
            name: "borrow_mint";
            docs: ["Borrow token mint"];
            type: "pubkey";
          },
          {
            name: "ltv_bps";
            docs: ["Loan-to-value ratio in basis points (8000 = 80%)"];
            type: "u16";
          },
          {
            name: "liquidation_threshold";
            docs: ["Liquidation threshold in basis points (8500 = 85%)"];
            type: "u16";
          },
          {
            name: "total_deposits";
            docs: ["Total deposits in the pool (tracked for utilization)"];
            type: "u64";
          },
          {
            name: "bump";
            docs: ["PDA bump seed"];
            type: "u8";
          },
        ];
      };
    },
    {
      name: "RepayOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
        ];
      };
    },
    {
      name: "SetUnset";
      docs: [
        "Utility struct to store a value that needs to be set by a certain number of participants (keys",
        "in our case). Once all participants have set the value, the value is considered set and we only",
        "store it once.",
      ];
      generics: [
        {
          kind: "type";
          name: "T";
        },
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "Set";
            fields: [
              {
                generic: "T";
              },
            ];
          },
          {
            name: "Unset";
            fields: [
              {
                generic: "T";
              },
              {
                vec: "bool";
              },
            ];
          },
        ];
      };
    },
    {
      name: "SharedEncryptedStruct";
      generics: [
        {
          kind: "const";
          name: "LEN";
          type: "usize";
        },
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "encryption_key";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "nonce";
            type: "u128";
          },
          {
            name: "ciphertexts";
            type: {
              array: [
                {
                  array: ["u8", 32];
                },
                {
                  generic: "LEN";
                },
              ];
            };
          },
        ];
      };
    },
    {
      name: "SignedComputationOutputs";
      generics: [
        {
          kind: "type";
          name: "O";
        },
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "Success";
            fields: [
              {
                generic: "O";
              },
              {
                array: ["u8", 64];
              },
            ];
          },
          {
            name: "Failure";
          },
          {
            name: "MarkerForIdlBuildDoNotUseThis";
            fields: [
              {
                generic: "O";
              },
            ];
          },
        ];
      };
    },
    {
      name: "SpendOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SpendOutputStruct0";
              };
            };
          },
        ];
      };
    },
    {
      name: "SpendOutputStruct0";
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
          {
            name: "field_1";
            type: "u8";
          },
          {
            name: "field_2";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "Timestamp";
      type: {
        kind: "struct";
        fields: [
          {
            name: "timestamp";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "UserObligation";
      docs: ["Per-user position with encrypted balances (Arcium ciphertexts)"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "user";
            docs: ["Owner of this position"];
            type: "pubkey";
          },
          {
            name: "pool";
            docs: ["Associated lending pool"];
            type: "pubkey";
          },
          {
            name: "encrypted_state";
            docs: [
              "Encrypted state containing [deposit (32), borrow (32), internal_balance (32)]",
              "Total: 96 bytes of Arcium ciphertexts",
            ];
            type: {
              array: ["u8", 96];
            };
          },
          {
            name: "is_initialized";
            docs: ["Initialization flag to avoid separate boolean checks"];
            type: "bool";
          },
          {
            name: "state_nonce";
            docs: ["Replay protection nonce (incremented each state update)"];
            type: "u128";
          },
          {
            name: "bump";
            docs: ["PDA bump seed"];
            type: "u8";
          },
        ];
      };
    },
    {
      name: "UtilityPubkeys";
      type: {
        kind: "struct";
        fields: [
          {
            name: "x25519_pubkey";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "ed25519_verifying_key";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "elgamal_pubkey";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "pubkey_validity_proof";
            type: {
              array: ["u8", 64];
            };
          },
        ];
      };
    },
    {
      name: "WithdrawOutput";
      docs: [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "WithdrawOutputStruct0";
              };
            };
          },
        ];
      };
    },
    {
      name: "WithdrawOutputStruct0";
      type: {
        kind: "struct";
        fields: [
          {
            name: "field_0";
            type: {
              defined: {
                name: "SharedEncryptedStruct";
                generics: [
                  {
                    kind: "const";
                    value: "3";
                  },
                ];
              };
            };
          },
          {
            name: "field_1";
            type: "u8";
          },
          {
            name: "field_2";
            type: "u64";
          },
        ];
      };
    },
  ];
};
