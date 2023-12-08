use anchor_lang::prelude::*;
use anchor_spl::{token::{Mint, TokenAccount, Token, Transfer, transfer, CloseAccount, close_account}, associated_token::AssociatedToken};
use crate::state::Escrow;

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    #[account(mut)]
    pub maker: SystemAccount<'info>,
    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker
    )]
    pub taker_ata_a: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = taker
    )]
    pub taker_ata_b: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker
    )]
    pub maker_ata_b: Account<'info, TokenAccount>,
    #[account(
        mut,
        close = maker,
        seeds=[b"escrow", maker.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = mint_b
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>
}

impl<'info> Take<'info> {
    pub fn deposit(&mut self) -> Result<()> {
        let transfer_accounts = Transfer {
            from: self.taker_ata_b.to_account_info(),
            to: self.maker_ata_b.to_account_info(),
            authority: self.taker.to_account_info()
        };

        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(), 
            transfer_accounts
        );

        transfer(cpi_ctx, self.escrow.receive)
    }

    pub fn withdraw_and_close_vault(&mut self) -> Result<()> {
        let signer_seeds: [&[&[u8]];1] = [
            &[
                b"escrow", 
                self.maker.to_account_info().key.as_ref(), 
                &self.escrow.seed.to_le_bytes()[..],
                &[self.escrow.bump]
            ]
        ];

        let accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.taker_ata_a.to_account_info(),
            authority: self.escrow.to_account_info()
        };

        let ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(), 
            accounts,
            &signer_seeds
        );

        transfer(ctx, self.vault.amount)?;

        let accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.taker.to_account_info(),
            authority: self.escrow.to_account_info()
        };

        let ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(), 
            accounts,
            &signer_seeds
        );

        close_account(ctx)
    }
}