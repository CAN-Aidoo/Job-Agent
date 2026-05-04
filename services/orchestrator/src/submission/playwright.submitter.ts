import { chromium, Browser, Page } from 'playwright';
import { SubmissionStrategy, SubmissionResult } from './strategy';
import { Profile } from '@jobagent/shared/src/interfaces/profile';

const CAPTCHA_INDICATORS = ['captcha', 'recaptcha', 'hcaptcha', 'g-recaptcha', 'cf-turnstile'];
const MFA_INDICATORS = ['verification code', 'two-factor', '2fa', 'mfa'];

function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class PlaywrightSubmitter implements SubmissionStrategy {
  name = 'playwright';

  async execute(
    draft: { cover_letter: string; screening_answers: unknown; resume_variant_id: string | null },
    posting: Record<string, unknown>,
    profile: Profile
  ): Promise<SubmissionResult> {
    const applyUrl = posting.apply_url as string;
    const actionLog: string[] = [];
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });
      const page = await context.newPage();

      actionLog.push(`Navigating to ${applyUrl}`);
      await page.goto(applyUrl, { waitUntil: 'networkidle' });
      await randomDelay(1000, 2000);

      // Check for CAPTCHA
      const pageContent = await page.content();
      const hasCaptcha = CAPTCHA_INDICATORS.some(c => pageContent.toLowerCase().includes(c));
      if (hasCaptcha) {
        actionLog.push('CAPTCHA detected — handing off to user');
        return {
          success: false,
          error: 'manual_required',
          receipt: { reason: 'captcha_detected', action_log: actionLog },
        };
      }

      // Check for MFA
      const hasMFA = MFA_INDICATORS.some(m => pageContent.toLowerCase().includes(m));
      if (hasMFA) {
        actionLog.push('MFA detected — handing off to user');
        return {
          success: false,
          error: 'manual_required',
          receipt: { reason: 'mfa_detected', action_log: actionLog },
        };
      }

      // Try to fill common form fields with human-paced typing
      await this.fillField(page, 'input[name*="name"], input[id*="name"]', profile.full_name, actionLog);
      await this.fillField(page, 'input[name*="email"], input[id*="email"], input[type="email"]', profile.email, actionLog);
      await this.fillField(page, 'input[name*="phone"], input[id*="phone"], input[type="tel"]', profile.phone || '', actionLog);

      // Try to fill cover letter in a textarea
      if (draft.cover_letter) {
        await this.fillField(page, 'textarea[name*="cover"], textarea[id*="cover"]', draft.cover_letter, actionLog);
      }

      // Look for submit button
      const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")');
      if (submitBtn) {
        await randomDelay(800, 2200);
        actionLog.push('Clicking submit button');
        await submitBtn.click();
        await randomDelay(2000, 4000);

        // Check for success indicators
        const afterContent = await page.content();
        const isSuccess = afterContent.toLowerCase().includes('thank') ||
                         afterContent.toLowerCase().includes('success') ||
                         afterContent.toLowerCase().includes('received');

        if (isSuccess) {
          return {
            success: true,
            receipt: { provider: 'playwright', action_log: actionLog, submitted_at: new Date().toISOString() },
          };
        }
      }

      actionLog.push('Could not confirm submission — marking for manual review');
      return {
        success: false,
        error: 'manual_required',
        receipt: { reason: 'submission_unconfirmed', action_log: actionLog },
      };

    } catch (err) {
      return {
        success: false,
        error: `Playwright error: ${(err as Error).message}`,
        receipt: { action_log: actionLog },
      };
    } finally {
      if (browser) await browser.close();
    }
  }

  private async fillField(page: Page, selector: string, value: string, log: string[]): Promise<void> {
    if (!value) return;
    try {
      const el = await page.$(selector);
      if (!el) return;

      log.push(`Filling ${selector}`);
      await el.click();
      await randomDelay(300, 600);

      // Type character by character with random delays
      for (const char of value) {
        await el.type(char, { delay: 80 + Math.random() * 120 });
      }
      await randomDelay(800, 2200);
    } catch {
      // Field not found or not fillable
    }
  }
}
