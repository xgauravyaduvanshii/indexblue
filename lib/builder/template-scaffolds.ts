import type { BuilderTemplateId } from '@/lib/builder/template-options';

export type BuilderTemplateScaffold = {
  name: string;
  slug: string;
  files: Record<string, string>;
};

function jsonFile(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function ipynbFile(notebookTitle: string) {
  return `${JSON.stringify(
    {
      cells: [
        {
          cell_type: 'markdown',
          metadata: {},
          source: [`# ${notebookTitle}\n`, '\n', 'Created from Indexblue Builder.\n'],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: ['print("Indexblue Builder notebook ready")\n'],
        },
      ],
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3',
        },
        language_info: {
          name: 'python',
          version: '3.11',
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    2,
  )}\n`;
}

const WEB_TEMPLATE_SCAFFOLDS: Record<Exclude<BuilderTemplateId, 'expo-app'>, BuilderTemplateScaffold> = {
  'next-app': {
    name: 'Next.js App',
    slug: 'nextjs-app',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-next-app',
        private: true,
        scripts: {
          dev: 'next dev --hostname 0.0.0.0 --port 3000',
          build: 'next build',
          start: 'next start --hostname 0.0.0.0 --port 3000',
        },
        dependencies: {
          next: '^16.0.0',
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
      }),
      'app/layout.tsx': `export const metadata = {
  title: 'Indexblue Next Starter',
  description: 'Generated from the Indexblue builder template gallery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
      'app/page.tsx': `const featureCards = [
  'App Router structure',
  'Builder-friendly starter copy',
  'Ready for AI-assisted edits',
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '48px 24px',
        background: 'radial-gradient(circle at top, #1d4ed8 0%, #08111f 48%, #020617 100%)',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <section
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: 32,
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(15, 23, 42, 0.72)',
          boxShadow: '0 24px 120px rgba(15, 23, 42, 0.42)',
        }}
      >
        <p style={{ margin: 0, color: '#7dd3fc', letterSpacing: '0.3em', fontSize: 12 }}>INDEXBLUE BUILDER</p>
        <h1 style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', margin: '16px 0 12px' }}>Next.js app starter</h1>
        <p style={{ maxWidth: 640, lineHeight: 1.7, color: 'rgba(248,250,252,0.78)' }}>
          This project starts with a polished Next.js shell so you can jump straight into product pages, dashboards,
          SaaS flows, and component work.
        </p>

        <div
          style={{
            marginTop: 28,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          {featureCards.map((card) => (
            <div
              key={card}
              style={{
                padding: 18,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {card}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
`,
      'README.md': '# Next.js App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'react-vite': {
    name: 'React + Vite',
    slug: 'react-vite',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-react-vite',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite --host 0.0.0.0 --port 3000',
          build: 'vite build',
          preview: 'vite preview --host 0.0.0.0 --port 3000',
        },
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.3.4',
          vite: '^6.0.0',
        },
      }),
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Indexblue React + Vite</title>
    <script type="module" src="/src/main.jsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
      'src/main.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
      'src/App.jsx': `const items = ['Design bold interfaces', 'Wire product logic fast', 'Ship with builder context'];

export default function App() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">INDEXBLUE BUILDER</span>
        <h1>React + Vite starter</h1>
        <p>
          A fast client-side workspace for dashboards, marketing pages, internal tools, and interactive surfaces.
        </p>
        <div className="grid">
          {items.map((item) => (
            <article key={item} className="card">
              {item}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
`,
      'src/styles.css': `:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
  background: #07111f;
  color: #f8fafc;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.38), transparent 28%),
    radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.22), transparent 24%),
    #07111f;
}

.shell {
  min-height: 100vh;
  padding: 48px 24px;
}

.hero {
  max-width: 1080px;
  margin: 0 auto;
  padding: 36px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.72);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.28em;
  color: #7dd3fc;
}

h1 {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  margin: 18px 0 12px;
}

p {
  max-width: 680px;
  color: rgba(248, 250, 252, 0.78);
  line-height: 1.7;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.card {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
`,
      'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
      'README.md': '# React + Vite\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'angular-app': {
    name: 'Angular App',
    slug: 'angular-app',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-angular-app',
        private: true,
        scripts: {
          dev: 'ng serve --host 0.0.0.0 --port 3000',
          build: 'ng build',
        },
        dependencies: {
          '@angular/animations': '^19.2.0',
          '@angular/common': '^19.2.0',
          '@angular/compiler': '^19.2.0',
          '@angular/core': '^19.2.0',
          '@angular/forms': '^19.2.0',
          '@angular/platform-browser': '^19.2.0',
          '@angular/platform-browser-dynamic': '^19.2.0',
          '@angular/router': '^19.2.0',
          rxjs: '^7.8.1',
          tslib: '^2.8.1',
          'zone.js': '^0.15.0',
        },
        devDependencies: {
          '@angular-devkit/build-angular': '^19.2.0',
          '@angular/cli': '^19.2.0',
          '@angular/compiler-cli': '^19.2.0',
          typescript: '^5.7.2',
        },
      }),
      'angular.json': jsonFile({
        $schema: './node_modules/@angular/cli/lib/config/schema.json',
        version: 1,
        projects: {
          app: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            prefix: 'app',
            architect: {
              build: {
                builder: '@angular-devkit/build-angular:application',
                options: {
                  browser: 'src/main.ts',
                  index: 'src/index.html',
                  polyfills: ['zone.js'],
                  tsConfig: 'tsconfig.app.json',
                  assets: [{ glob: '**/*', input: 'public' }],
                  styles: ['src/styles.css'],
                },
              },
              serve: {
                builder: '@angular-devkit/build-angular:dev-server',
                options: {
                  buildTarget: 'app:build',
                  host: '0.0.0.0',
                  port: 3000,
                },
              },
            },
          },
        },
      }),
      'tsconfig.json': jsonFile({
        compileOnSave: false,
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
          baseUrl: '.',
          useDefineForClassFields: false,
          lib: ['ES2022', 'dom'],
        },
        angularCompilerOptions: {
          strictTemplates: true,
        },
      }),
      'tsconfig.app.json': jsonFile({
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: './out-tsc/app',
          types: [],
        },
        files: ['src/main.ts'],
      }),
      'src/index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Indexblue Angular App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
`,
      'src/main.ts': `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((error) => console.error(error));
`,
      'src/app/app.component.ts': `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  items = ['Standalone Angular shell', 'Structured for builder edits', 'Ready for product UIs'];
}
`,
      'src/app/app.component.html': `<main class="shell">
  <section class="hero">
    <span class="eyebrow">INDEXBLUE BUILDER</span>
    <h1>Angular app starter</h1>
    <p>Use this project for Angular dashboards, portals, and structured product interfaces.</p>
    <div class="grid">
      <article class="card" *ngFor="let item of items">{{ item }}</article>
    </div>
  </section>
</main>
`,
      'src/app/app.component.css': `.shell {
  min-height: 100vh;
  padding: 48px 24px;
  background:
    radial-gradient(circle at top, rgba(239, 68, 68, 0.24), transparent 22%),
    linear-gradient(180deg, #09090f 0%, #111827 100%);
  color: #f8fafc;
  font-family: system-ui, sans-serif;
}

.hero {
  max-width: 1040px;
  margin: 0 auto;
  padding: 36px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(17, 24, 39, 0.76);
}

.eyebrow {
  color: #fca5a5;
  font-size: 12px;
  letter-spacing: 0.28em;
}

h1 {
  margin: 16px 0 12px;
  font-size: clamp(2.4rem, 7vw, 4.3rem);
}

p {
  max-width: 640px;
  line-height: 1.7;
  color: rgba(248, 250, 252, 0.78);
}

.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin-top: 28px;
}

.card {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
`,
      'src/styles.css': `html, body {
  margin: 0;
}
`,
      'README.md': '# Angular App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'static-site': {
    name: 'Static Site',
    slug: 'static-site',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-static-site',
        private: true,
        scripts: {
          dev: 'npx serve . -l 3000',
        },
      }),
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Indexblue Static Site</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <div class="hero">
        <span class="eyebrow">INDEXBLUE BUILDER</span>
        <h1>Static site starter</h1>
        <p>Clean HTML and CSS scaffolding for landing pages, product launches, and marketing experiments.</p>
      </div>
    </main>
  </body>
</html>
`,
      'styles.css': `:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
  --bg: #0b1020;
  --panel: rgba(255, 255, 255, 0.08);
  --line: rgba(255, 255, 255, 0.12);
  --text: #f8fafc;
  --muted: rgba(248, 250, 252, 0.76);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 0%, rgba(56, 189, 248, 0.24), transparent 20%),
    radial-gradient(circle at 90% 10%, rgba(244, 114, 182, 0.16), transparent 18%),
    var(--bg);
  color: var(--text);
}

.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.hero {
  max-width: 960px;
  padding: 36px;
  border-radius: 28px;
  border: 1px solid var(--line);
  background: var(--panel);
  backdrop-filter: blur(18px);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.32em;
  color: #7dd3fc;
}

h1 {
  margin: 16px 0 12px;
  font-size: clamp(2.4rem, 6vw, 4.2rem);
}

p {
  margin: 0;
  max-width: 620px;
  line-height: 1.75;
  color: var(--muted);
}
`,
      'README.md': '# Static Site\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'docker-node': {
    name: 'Docker Node App',
    slug: 'docker-node',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-docker-node',
        private: true,
        type: 'module',
        scripts: {
          dev: 'node server.js',
        },
      }),
      'server.js': `import http from 'node:http';

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(\`<!doctype html>
  <html lang="en">
    <body style="margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;padding:40px">
      <h1>Docker Node starter</h1>
      <p>Route: \${request.url}</p>
    </body>
  </html>\`);
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Docker Node starter listening on http://0.0.0.0:3000');
});
`,
      Dockerfile: `FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
`,
      '.dockerignore': `node_modules
npm-debug.log
`,
      'README.md': '# Docker Node App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'docker-universal': {
    name: 'Docker Universal',
    slug: 'docker-universal',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-docker-universal',
        private: true,
        type: 'module',
        scripts: {
          dev: 'node server.js',
        },
      }),
      'server.js': `import http from 'node:http';

const message = {
  product: 'Indexblue Builder',
  template: 'Docker Universal',
  status: 'ready',
};

http
  .createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(message, null, 2));
  })
  .listen(3000, '0.0.0.0', () => {
    console.log('Docker universal starter listening on http://0.0.0.0:3000');
  });
`,
      Dockerfile: `FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
`,
      'docker-compose.yml': `services:
  app:
    build:
      context: .
    ports:
      - "3000:3000"
`,
      'README.md': '# Docker Universal\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'node-api': {
    name: 'Node.js API',
    slug: 'node-api',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-node-api',
        private: true,
        type: 'module',
        scripts: {
          dev: 'node server.js',
        },
      }),
      'server.js': `import http from 'node:http';

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify(
      {
        ok: true,
        route: request.url,
        project: 'Indexblue Builder',
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Node API starter listening on http://0.0.0.0:3000');
});
`,
      'README.md': '# Node.js API\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'node-http': {
    name: 'Node HTTP Server',
    slug: 'node-http-server',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-node-http',
        private: true,
        type: 'module',
        scripts: {
          dev: 'node server.js',
        },
      }),
      'server.js': `import http from 'node:http';

http
  .createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(\`Indexblue HTTP starter says hello from \${request.url}\\n\`);
  })
  .listen(3000, '0.0.0.0', () => {
    console.log('Node HTTP starter listening on http://0.0.0.0:3000');
  });
`,
      'README.md': '# Node HTTP Server\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'python-app': {
    name: 'Python App',
    slug: 'python-app',
    files: {
      requirements: `flask==3.1.0
`,
      'app.py': `from flask import Flask

app = Flask(__name__)


@app.get("/")
def home():
    return """
    <html>
      <body style="margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;padding:40px">
        <h1>Python app starter</h1>
        <p>Indexblue Builder prepared a lightweight Flask app for you.</p>
      </body>
    </html>
    """


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
`,
      'README.md': '# Python App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'tensorflow-python': {
    name: 'TensorFlow Python',
    slug: 'tensorflow-python',
    files: {
      requirements: `flask==3.1.0
tensorflow==2.18.0
`,
      'app.py': `from flask import Flask
import tensorflow as tf

app = Flask(__name__)


@app.get("/")
def home():
    return {
        "template": "TensorFlow Python",
        "builder": "Indexblue",
        "tensorflow_version": tf.__version__,
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
`,
      'train.py': `import tensorflow as tf

print("TensorFlow version:", tf.__version__)
print("Starter project ready for model experiments.")
`,
      'README.md': '# TensorFlow Python\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'pytorch-python': {
    name: 'PyTorch Python',
    slug: 'pytorch-python',
    files: {
      requirements: `flask==3.1.0
torch==2.6.0
`,
      'app.py': `from flask import Flask
import torch

app = Flask(__name__)


@app.get("/")
def home():
    return {
        "template": "PyTorch Python",
        "builder": "Indexblue",
        "torch_version": torch.__version__,
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
`,
      'train.py': `import torch

sample = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
print("Torch version:", torch.__version__)
print("Tensor shape:", sample.shape)
`,
      'README.md': '# PyTorch Python\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'bun-app': {
    name: 'Bun App',
    slug: 'bun-app',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-bun-app',
        private: true,
        type: 'module',
        scripts: {
          dev: 'bun run src/server.ts',
        },
      }),
      'src/server.ts': `const server = Bun.serve({
  port: 3000,
  fetch(request) {
    return new Response(
      JSON.stringify(
        {
          template: 'Bun App',
          builder: 'Indexblue',
          route: new URL(request.url).pathname,
        },
        null,
        2,
      ),
      {
        headers: { 'content-type': 'application/json' },
      },
    );
  },
});

console.log(\`Bun starter listening on http://\${server.hostname}:\${server.port}\`);
`,
      'README.md': '# Bun App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
  'jupyter-python': {
    name: 'Jupyter Lab',
    slug: 'jupyter-python',
    files: {
      requirements: `jupyterlab==4.4.0
ipykernel==6.29.5
`,
      'notebooks/starter.ipynb': ipynbFile('Indexblue Notebook Starter'),
      'README.md': '# Jupyter Lab\n\nRun `jupyter lab --ip=0.0.0.0 --port=3000 --no-browser --ServerApp.token=\"\"`.\n',
    },
  },
  'nuxt-app': {
    name: 'Nuxt App',
    slug: 'nuxt-app',
    files: {
      'package.json': jsonFile({
        name: 'indexblue-nuxt-app',
        private: true,
        scripts: {
          dev: 'nuxt dev --host 0.0.0.0 --port 3000',
          build: 'nuxt build',
          preview: 'nuxt preview --host 0.0.0.0 --port 3000',
        },
        dependencies: {
          nuxt: '^3.15.0',
          vue: '^3.5.13',
          'vue-router': '^4.5.0',
        },
      }),
      'app.vue': `<template>
  <main class="shell">
    <section class="hero">
      <span class="eyebrow">INDEXBLUE BUILDER</span>
      <h1>Nuxt app starter</h1>
      <p>Launch Vue-powered product experiences with a clean Nuxt 3 shell.</p>
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top, rgba(34, 197, 94, 0.18), transparent 18%),
    linear-gradient(180deg, #07111f 0%, #020617 100%);
  color: #f8fafc;
}

.shell {
  min-height: 100vh;
  padding: 48px 24px;
}

.hero {
  max-width: 1040px;
  margin: 0 auto;
  padding: 36px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.72);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.28em;
  color: #86efac;
}

h1 {
  margin: 16px 0 12px;
  font-size: clamp(2.4rem, 6vw, 4.2rem);
}

p {
  max-width: 620px;
  line-height: 1.75;
  color: rgba(248, 250, 252, 0.78);
}
</style>
`,
      'nuxt.config.ts': `export default defineNuxtConfig({
  devtools: { enabled: true },
});
`,
      'README.md': '# Nuxt App\n\nStarter workspace created from Indexblue Builder.\n',
    },
  },
};

export function getBuilderTemplateScaffold(templateId: Exclude<BuilderTemplateId, 'expo-app'>) {
  return WEB_TEMPLATE_SCAFFOLDS[templateId];
}
