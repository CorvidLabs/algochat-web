import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
        canActivate: [noAuthGuard],
    },
    {
        path: 'chat',
        loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
        canActivate: [authGuard],
    },
    {
        path: 'terms',
        loadComponent: () => import('./features/legal/terms.component').then((m) => m.TermsComponent),
    },
    {
        path: 'privacy',
        loadComponent: () => import('./features/legal/privacy.component').then((m) => m.PrivacyComponent),
    },
    {
        path: 'protocol',
        loadComponent: () => import('./features/protocol/protocol.component').then((m) => m.ProtocolComponent),
    },
    {
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full',
    },
    {
        path: '**',
        redirectTo: 'chat',
    },
];
