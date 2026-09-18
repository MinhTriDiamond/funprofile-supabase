import { useState, useEffect } from 'react';
import { ArrowLeft, Printer, Github, Package, Terminal, FileCode, FolderTree, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DocSection, DocSubSection, DocParagraph, DocList, DocTable, DocAlert } from '@/components/docs/DocSection';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { TableOfContents } from '@/components/docs/TableOfContents';

const tocItems = [
  { id: 'overview', title: 'Tổng quan', level: 1 },
  { id: 'repository-structure', title: 'Cấu trúc Repository', level: 1 },
  { id: 'package-json', title: 'package.json', level: 1 },
  { id: 'tsconfig', title: 'tsconfig.json', level: 1 },
  { id: 'rollup-config', title: 'rollup.config.js', level: 1 },
  { id: 'source-code', title: 'Source Code', level: 1 },
  { id: 'readme', title: 'README.md', level: 1 },
  { id: 'examples', title: 'Examples', level: 1 },
  { id: 'examples-react', title: 'React Integration', level: 2 },
  { id: 'examples-nextjs', title: 'Next.js Integration', level: 2 },
  { id: 'github-actions', title: 'GitHub Actions', level: 1 },
  { id: 'publishing', title: 'Publishing to npm', level: 1 },
  { id: 'installation', title: 'Hướng dẫn cài đặt', level: 1 },
];

const SdkRepositoryDocs = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const handleScroll = () => {
      const sections = tocItems.map(item => document.getElementById(item.id));
      const scrollPosition = window.scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(tocItems[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/docs/integration')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">SDK Repository Setup</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/fun-ecosystem/sso-sdk" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-20">
              <TableOfContents items={tocItems} activeId={activeSection} />
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 max-w-4xl">
            {/* Overview */}
            <DocSection id="overview" title="Tổng quan">
              <DocParagraph>
                Hướng dẫn tạo GitHub Repository cho <code>@fun-ecosystem/sso-sdk</code> - SDK chính thức 
                để tích hợp Fun Farm, Fun Play, Fun Planet với Fun Profile SSO.
              </DocParagraph>
              
              <DocAlert type="info">
                <p className="font-semibold mb-2">Lợi ích của SDK Repository riêng</p>
                <DocList items={[
                  'Versioning - Lock version SDK, không bị ảnh hưởng khi Fun Profile update',
                  'npm install - Cài đặt 1 lệnh thay vì copy nhiều files',
                  'Auto-updates - Dependabot có thể suggest security updates',
                  'TypeScript support - Types tự động available khi import',
                ]} />
              </DocAlert>
            </DocSection>

            {/* Repository Structure */}
            <DocSection id="repository-structure" title="Cấu trúc Repository">
              <DocParagraph>
                Cấu trúc thư mục chuẩn cho npm package với TypeScript:
              </DocParagraph>
              
              <CodeBlock
                language="bash"
                title="Repository Structure"
                code={`fun-ecosystem-sso-sdk/
├── src/                          # Source code (TypeScript)
│   ├── index.ts                  # Main export
│   ├── FunProfileClient.ts       # Core client
│   ├── constants.ts              # Constants & endpoints
│   ├── types.ts                  # TypeScript types
│   ├── errors.ts                 # Error classes
│   ├── storage.ts                # Storage adapters
│   ├── pkce.ts                   # PKCE utilities
│   └── sync-manager.ts           # Debounced sync manager
├── dist/                         # Compiled output (generated)
├── examples/                     # Example code
│   ├── react/                    # React integration
│   │   ├── FunProfileContext.tsx
│   │   ├── AuthCallback.tsx
│   │   ├── LoginButton.tsx
│   │   └── useFarmSync.ts
│   ├── vanilla/                  # Vanilla JS
│   │   └── basic-auth.html
│   └── next/                     # Next.js
│       └── app/
├── docs/                         # Documentation
│   ├── SECURITY.md
│   ├── MIGRATION.md
│   └── API.md
├── package.json
├── tsconfig.json
├── rollup.config.js
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .github/
    └── workflows/
        └── publish.yml           # Auto-publish to npm`}
              />
            </DocSection>

            {/* package.json */}
            <DocSection id="package-json" title="package.json">
              <DocParagraph>
                Cấu hình package với dual exports (ESM + CJS):
              </DocParagraph>
              
              <CodeBlock
                language="json"
                title="package.json"
                code={`{
  "name": "@fun-ecosystem/sso-sdk",
  "version": "1.0.0",
  "description": "Official SSO SDK for Fun Ecosystem (Fun Farm, Fun Play, Fun Planet)",
  "main": "dist/index.cjs.js",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "keywords": [
    "fun-profile", "fun-farm", "fun-play", "fun-planet",
    "sso", "oauth", "pkce", "authentication", "web3"
  ],
  "author": "Fun Ecosystem Team",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/fun-ecosystem/sso-sdk"
  },
  "homepage": "https://fun.rich/docs/integration",
  "bugs": {
    "url": "https://github.com/fun-ecosystem/sso-sdk/issues"
  },
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build",
    "release": "npm run build && npm publish --access public"
  },
  "devDependencies": {
    "@rollup/plugin-typescript": "^11.1.6",
    "@types/node": "^20.11.0",
    "rollup": "^4.9.6",
    "rollup-plugin-dts": "^6.1.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "peerDependencies": {},
  "engines": {
    "node": ">=16.0.0"
  },
  "sideEffects": false
}`}
              />
            </DocSection>

            {/* tsconfig.json */}
            <DocSection id="tsconfig" title="tsconfig.json">
              <CodeBlock
                language="json"
                title="tsconfig.json"
                code={`{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "declaration": true,
    "declarationDir": "./dist",
    "emitDeclarationOnly": false,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "examples"]
}`}
              />
            </DocSection>

            {/* rollup.config.js */}
            <DocSection id="rollup-config" title="rollup.config.js">
              <DocParagraph>
                Rollup config để build cả ESM và CJS formats:
              </DocParagraph>
              
              <CodeBlock
                language="javascript"
                title="rollup.config.js"
                code={`import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = [];

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    external,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
];`}
              />
            </DocSection>

            {/* Source Code */}
            <DocSection id="source-code" title="Source Code">
              <DocParagraph>
                Copy các files từ <code>src/lib/sso-sdk/</code> của Fun Profile vào <code>src/</code> của repository mới.
                Cần điều chỉnh imports để không dùng <code>@/</code> alias:
              </DocParagraph>

              <DocSubSection title="src/index.ts">
                <CodeBlock
                  language="typescript"
                  title="src/index.ts"
                  code={`/**
 * @fun-ecosystem/sso-sdk
 * 
 * Official SSO SDK for Fun Ecosystem platforms.
 * 
 * @example
 * import { FunProfileClient, SessionStorageAdapter } from '@fun-ecosystem/sso-sdk';
 * 
 * const client = new FunProfileClient({
 *   clientId: 'fun_farm_production',
 *   redirectUri: 'https://farm.fun.rich/auth/callback',
 *   scopes: ['profile', 'wallet', 'rewards'],
 *   storage: new SessionStorageAdapter('fun_farm'),
 * });
 */

// Core client
export { FunProfileClient } from './FunProfileClient';

// Types
export type {
  FunProfileConfig,
  TokenStorage,
  TokenData,
  FunUser,
  SoulNft,
  UserRewards,
  RegisterOptions,
  SyncOptions,
  AuthResult,
  SyncResult,
  RequestOptions,
  SSOError,
} from './types';

// Errors
export {
  FunProfileError,
  TokenExpiredError,
  InvalidTokenError,
  RateLimitError,
  ValidationError,
  NetworkError,
} from './errors';

// Storage adapters
export {
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SessionStorageAdapter,
} from './storage';

// Sync Manager
export { DebouncedSyncManager } from './sync-manager';
export type { SyncFunction } from './sync-manager';

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  storeCodeVerifier,
  retrieveCodeVerifier,
} from './pkce';

// Constants
export {
  DOMAINS,
  API_BASE_URL,
  DEFAULT_BASE_URL,
  ENDPOINTS,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER,
  SDK_VERSION,
} from './constants';`}
                />
              </DocSubSection>

              <DocAlert type="warning">
                <p className="font-semibold mb-1">Lưu ý khi copy source code</p>
                <p>Đổi tất cả imports từ <code>./types</code> thay vì <code>@/lib/sso-sdk/types</code></p>
              </DocAlert>
            </DocSection>

            {/* README.md */}
            <DocSection id="readme" title="README.md">
              <CodeBlock
                language="markdown"
                title="README.md"
                code={`# @fun-ecosystem/sso-sdk

Official SSO SDK for Fun Ecosystem - Integrate Fun Farm, Fun Play, and Fun Planet with Fun Profile Single Sign-On.

[![npm version](https://badge.fury.io/js/@fun-ecosystem%2Fsso-sdk.svg)](https://www.npmjs.com/package/@fun-ecosystem/sso-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🔐 **OAuth 2.0 + PKCE** - Secure authentication
- 💾 **Multiple Storage Options** - LocalStorage, SessionStorage, or custom
- ⚡ **Debounced Sync** - Efficient data synchronization
- 📘 **TypeScript First** - Full type definitions
- 🪶 **Zero Dependencies** - Lightweight

## 📦 Installation

\`\`\`bash
npm install @fun-ecosystem/sso-sdk
\`\`\`

## 🚀 Quick Start

\`\`\`typescript
import { 
  FunProfileClient, 
  SessionStorageAdapter 
} from '@fun-ecosystem/sso-sdk';

const funProfile = new FunProfileClient({
  clientId: 'fun_farm_production',
  redirectUri: 'https://farm.fun.rich/auth/callback',
  scopes: ['profile', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_farm'),
});

// Start login
const loginUrl = await funProfile.startAuth();
window.location.href = loginUrl;
\`\`\`

## 🔒 Storage Security

| Scope | Recommended Storage |
|-------|---------------------|
| \`profile\`, \`email\` | LocalStorageAdapter |
| \`wallet\`, \`rewards\` | SessionStorageAdapter ✅ |

## 📖 Documentation

- [Integration Guide](https://fun.rich/docs/integration)
- [API Reference](./docs/API.md)
- [Security Best Practices](./docs/SECURITY.md)

## 📄 License

MIT © Fun Ecosystem Team`}
              />
            </DocSection>

            {/* Examples */}
            <DocSection id="examples" title="Examples">
              <DocParagraph>
                Các ví dụ hoàn chỉnh để tích hợp SDK vào các framework khác nhau.
              </DocParagraph>
            </DocSection>

            {/* React Examples */}
            <DocSection id="examples-react" title="React Integration">
              <DocSubSection title="FunProfileContext.tsx">
                <CodeBlock
                  language="typescript"
                  title="examples/react/FunProfileContext.tsx"
                  code={`import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { 
  FunProfileClient, 
  FunUser, 
  SessionStorageAdapter,
  DebouncedSyncManager 
} from '@fun-ecosystem/sso-sdk';

interface FunProfileContextType {
  user: FunUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  syncManager: DebouncedSyncManager | null;
}

const FunProfileContext = createContext<FunProfileContextType | undefined>(undefined);

// Initialize client
const funProfile = new FunProfileClient({
  clientId: import.meta.env.VITE_FUN_CLIENT_ID || 'fun_farm_production',
  redirectUri: \`\${window.location.origin}/auth/callback\`,
  scopes: ['profile', 'email', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_farm'),
  autoRefresh: true,
});

export function FunProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FunUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncManager, setSyncManager] = useState<DebouncedSyncManager | null>(null);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (await funProfile.isAuthenticated()) {
          const userData = await funProfile.getUser();
          setUser(userData);
          setSyncManager(funProfile.getSyncManager(3000));
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async () => {
    const loginUrl = await funProfile.startAuth();
    window.location.href = loginUrl;
  }, []);

  const logout = useCallback(async () => {
    await funProfile.logout();
    setUser(null);
    setSyncManager(null);
  }, []);

  return (
    <FunProfileContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        syncManager,
      }}
    >
      {children}
    </FunProfileContext.Provider>
  );
}

export function useFunProfile() {
  const context = useContext(FunProfileContext);
  if (!context) {
    throw new Error('useFunProfile must be used within FunProfileProvider');
  }
  return context;
}

export { funProfile };`}
                />
              </DocSubSection>

              <DocSubSection title="AuthCallback.tsx với Camly Messages">
                <CodeBlock
                  language="typescript"
                  title="examples/react/AuthCallback.tsx"
                  code={`import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { funProfile } from './FunProfileContext';

// Camly loading messages 🐫
const CAMLY_MESSAGES = [
  "Camly đang kết nối bạn với Fun Profile... 🐫",
  "Đợi Camly tí nha, đang xác thực... ✨",
  "Camly đang chuẩn bị hồ sơ cho bạn... 📋",
  "Sắp xong rồi, Camly đang hoàn tất... 🎉",
];

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState(CAMLY_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Rotate messages
    const interval = setInterval(() => {
      setMessage(prev => {
        const idx = CAMLY_MESSAGES.indexOf(prev);
        return CAMLY_MESSAGES[(idx + 1) % CAMLY_MESSAGES.length];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError(\`Đăng nhập thất bại: \${errorParam}\`);
        return;
      }

      if (!code || !state) {
        setError('Thiếu thông tin xác thực');
        return;
      }

      try {
        await funProfile.handleCallback(code, state);
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Callback error:', err);
        setError('Không thể hoàn tất đăng nhập');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">😿</p>
          <p className="text-red-500">{error}</p>
          <button 
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce">🐫</div>
        <p className="text-lg text-muted-foreground animate-pulse">
          {message}
        </p>
      </div>
    </div>
  );
}`}
                />
              </DocSubSection>

              <DocSubSection title="useFarmSync Hook">
                <CodeBlock
                  language="typescript"
                  title="examples/react/useFarmSync.ts"
                  code={`import { useCallback } from 'react';
import { useFunProfile } from './FunProfileContext';

/**
 * Hook for syncing farm data with debounce
 * 
 * @example
 * const { syncHarvest, syncInventory } = useFarmSync();
 * 
 * // Call rapidly - only syncs after 3s of inactivity
 * await syncHarvest({ crop: 'wheat', amount: 10 });
 */
export function useFarmSync() {
  const { syncManager } = useFunProfile();

  const syncHarvest = useCallback(
    (data: { crop: string; amount: number }) => {
      if (!syncManager) return;
      
      syncManager.queue('harvest_stats', {
        last_harvest: new Date().toISOString(),
        ...data,
      });
    },
    [syncManager]
  );

  const syncInventory = useCallback(
    (items: Record<string, number>) => {
      if (!syncManager) return;
      
      syncManager.queue('inventory', items);
    },
    [syncManager]
  );

  const syncAchievement = useCallback(
    (achievementId: string) => {
      if (!syncManager) return;
      
      syncManager.queue('achievements', {
        unlocked: achievementId,
        unlocked_at: new Date().toISOString(),
      });
    },
    [syncManager]
  );

  const flushAll = useCallback(async () => {
    if (syncManager) {
      await syncManager.flush();
    }
  }, [syncManager]);

  return {
    syncHarvest,
    syncInventory,
    syncAchievement,
    flushAll,
  };
}`}
                />
              </DocSubSection>
            </DocSection>

            {/* Next.js Examples */}
            <DocSection id="examples-nextjs" title="Next.js Integration">
              <CodeBlock
                language="typescript"
                title="examples/next/app/auth/callback/page.tsx"
                code={`'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FunProfileClient, SessionStorageAdapter } from '@fun-ecosystem/sso-sdk';

const funProfile = new FunProfileClient({
  clientId: process.env.NEXT_PUBLIC_FUN_CLIENT_ID!,
  redirectUri: \`\${process.env.NEXT_PUBLIC_APP_URL}/auth/callback\`,
  scopes: ['profile', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_play'),
});

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        setStatus('error');
        return;
      }

      try {
        await funProfile.handleCallback(code, state);
        router.replace('/dashboard');
      } catch (error) {
        console.error('Auth callback failed:', error);
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-red-500">Authentication Failed</h1>
          <button onClick={() => router.push('/login')} className="mt-4 underline">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
}`}
              />
            </DocSection>

            {/* GitHub Actions */}
            <DocSection id="github-actions" title="GitHub Actions">
              <DocParagraph>
                Auto-publish to npm khi tạo release tag:
              </DocParagraph>
              
              <CodeBlock
                language="yaml"
                title=".github/workflows/publish.yml"
                code={`name: Publish to npm

on:
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}`}
              />

              <DocAlert type="info">
                <p className="font-semibold mb-2">Cần thiết lập</p>
                <DocList items={[
                  'Tạo npm account và organization @fun-ecosystem',
                  'Tạo npm access token',
                  'Thêm NPM_TOKEN vào GitHub repository secrets',
                ]} />
              </DocAlert>
            </DocSection>

            {/* Publishing */}
            <DocSection id="publishing" title="Publishing to npm">
              <DocSubSection title="Bước 1: Tạo npm Organization">
                <CodeBlock
                  language="bash"
                  code={`# Đăng nhập npm
npm login

# Tạo organization (trên npmjs.com)`}
                />
              </DocSubSection>

              <DocSubSection title="Bước 2: Publish lần đầu">
                <CodeBlock
                  language="bash"
                  code={`# Build package
npm run build

# Publish với scope public
npm publish --access public`}
                />
              </DocSubSection>

              <DocSubSection title="Bước 3: Tạo release">
                <CodeBlock
                  language="bash"
                  code={`# Tag version mới
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions sẽ tự động publish`}
                />
              </DocSubSection>
            </DocSection>

            {/* Installation Guide */}
            <DocSection id="installation" title="Hướng dẫn cài đặt (cho platforms)">
              <DocParagraph>
                Sau khi SDK được publish, các platforms chỉ cần chạy:
              </DocParagraph>

              <CodeBlock
                language="bash"
                title="Terminal"
                code={`# npm
npm install @fun-ecosystem/sso-sdk

# yarn  
yarn add @fun-ecosystem/sso-sdk

# pnpm
pnpm add @fun-ecosystem/sso-sdk`}
              />

              <DocSubSection title="Sử dụng trong code">
                <CodeBlock
                  language="typescript"
                  title="src/lib/funProfileClient.ts"
                  code={`import { 
  FunProfileClient, 
  SessionStorageAdapter,
  DOMAINS 
} from '@fun-ecosystem/sso-sdk';

export const funProfile = new FunProfileClient({
  clientId: 'fun_farm_production',
  redirectUri: \`\${DOMAINS.funFarm}/auth/callback\`,
  scopes: ['profile', 'email', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_farm'),
  autoRefresh: true,
});`}
                />
              </DocSubSection>

              <DocTable
                headers={['Platform', 'Client ID', 'Scopes']}
                rows={[
                  ['Fun Farm', 'fun_farm_production', 'profile, email, wallet, rewards'],
                  ['Fun Play', 'fun_play_production', 'profile, wallet, rewards, soul_nft'],
                  ['Fun Planet', 'fun_planet_production', 'profile, wallet, rewards'],
                ]}
              />
            </DocSection>

            {/* Footer */}
            <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
              <p>@fun-ecosystem/sso-sdk • MIT License</p>
              <p className="mt-2">Created with 💜 by Fun Ecosystem Team</p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SdkRepositoryDocs;
