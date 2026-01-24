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
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full',
    },
    {
        path: '**',
        redirectTo: 'chat',
    },
];
