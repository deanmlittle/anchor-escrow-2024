import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { randomBytes } from "crypto";

describe("anchor-escrow", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();

  const connection = provider.connection;

  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;

  const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...block,
    });
    return signature;
  };

  const log = async (signature: string): Promise<string> => {
    console.log(
      `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    );
    return signature;
  };

  const seed = new BN(randomBytes(8));

  const [maker, taker, mintA, mintB] = Array.from({ length: 4 }, () =>
    Keypair.generate()
  );

  const [makerAtaA, makerAtaB, takerAtaA, takerAtaB] = [maker, taker]
    .map((a) =>
      [mintA, mintB].map((m) =>
        getAssociatedTokenAddressSync(m.publicKey, a.publicKey)
      )
    )
    .flat();

  const escrow = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toBuffer("le", 8)],
    program.programId
  )[0];
  const vault = getAssociatedTokenAddressSync(mintA.publicKey, escrow, true);

  // Accounts
  const accounts = {
    maker: maker.publicKey,
    taker: taker.publicKey,
    mintA: mintA.publicKey,
    mintB: mintB.publicKey,
    makerAtaA,
    makerAtaB,
    takerAtaA,
    takerAtaB,
    escrow,
    vault,
    associatedTokenprogram: ASSOCIATED_TOKEN_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId 
  }

  it("Airdrop and create mints", async () => {
    let lamports = await getMinimumBalanceForRentExemptMint(connection);
    let tx = new Transaction();
    tx.instructions = [
      ...[maker, taker].map((k) =>
        SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: k.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      ),
      ...[mintA, mintB].map((m) =>
        SystemProgram.createAccount({
          fromPubkey: provider.publicKey,
          newAccountPubkey: m.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        })
      ),
      ...[
        [mintA.publicKey, maker.publicKey, makerAtaA],
        [mintB.publicKey, taker.publicKey, takerAtaB],
      ]
      .flatMap((x) => [
        createInitializeMint2Instruction(x[0], 6, x[1], null),
        createAssociatedTokenAccountIdempotentInstruction(provider.publicKey, x[2], x[1], x[0]),
        createMintToInstruction(x[0], x[2], x[1], 1e9),
      ])
    ];

    await provider.sendAndConfirm(tx, [mintA, mintB, maker, taker]).then(log);
  });

  it("Make", async () => {
    await program.methods
      .make(seed, new BN(1e6), new BN(1e6))
      .accounts({...accounts})
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  xit("Refund", async () => {
    await program.methods
      .refund()
      .accounts({...accounts})
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  it("Take", async () => {
    await program.methods
      .take()
      .accounts({ ...accounts })
      .signers([taker])
      .rpc()
      .then(confirm)
      .then(log);
  });
});
