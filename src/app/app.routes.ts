import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    },
    {
        path: 'chat',
        loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
    },
    {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
    },
    {
        path: '**',
        redirectTo: 'login',
    },
];
