export const APP_NAME = 'Тулгагч Studio';

/**
 * Support line shown on the login screen ("Зөвлөхтэйгөө ярих").
 * Leave empty to hide the link until a real number is decided.
 */
export const SUPPORT_PHONE = '';

/**
 * TEMPORARY test account, shown on the login page and accepted by the demo API.
 * Remove (together with the hint in `login.tsx`) once real accounts exist.
 */
export const TEST_ACCOUNT = { phone: '99996666', password: 'admintest' } as const;

/** TEMPORARY: password-reset code the demo API accepts (no SMS is sent in demo mode). */
export const DEMO_RESET_CODE = '123456';
