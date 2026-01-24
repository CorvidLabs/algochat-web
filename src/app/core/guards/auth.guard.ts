import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { WalletService } from '../services/wallet.service';

/**
 * Guard that requires authentication.
 * Redirects to /login if not connected.
 */
export const authGuard: CanActivateFn = () => {
    const wallet = inject(WalletService);
    const router = inject(Router);

    console.log('[authGuard] Checking auth, connected:', wallet.connected());

    if (wallet.connected()) {
        return true;
    }

    console.log('[authGuard] Not authenticated, redirecting to login');
    return router.createUrlTree(['/login']);
};

/**
 * Guard that redirects already-authenticated users away from login.
 * Redirects to /chat if already connected.
 */
export const noAuthGuard: CanActivateFn = () => {
    const wallet = inject(WalletService);
    const router = inject(Router);

    console.log('[noAuthGuard] Checking if already logged in:', wallet.connected());

    if (!wallet.connected()) {
        return true;
    }

    console.log('[noAuthGuard] Already authenticated, redirecting to chat');
    return router.createUrlTree(['/chat']);
};
