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

    if (wallet.connected()) {
        return true;
    }

    return router.createUrlTree(['/login']);
};

/**
 * Guard that redirects already-authenticated users away from login.
 * Redirects to /chat if already connected.
 */
export const noAuthGuard: CanActivateFn = () => {
    const wallet = inject(WalletService);
    const router = inject(Router);

    if (!wallet.connected()) {
        return true;
    }

    return router.createUrlTree(['/chat']);
};
