import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#059669" />
        <title>Scoreline — Football Analytics & Betting Intelligence</title>
        <meta
          name="description"
          content="Football fixtures, custom stats engine, betting intelligence and odds fusion."
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root { height: 100%; }
              body { overflow-y: auto; -webkit-overflow-scrolling: touch; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
