import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import { type PropsWithChildren } from "react";

// Installable web app: manifest, icons, theme colour, and a small service worker for the app shell.
const sw = `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); }); }`;
const bg = `html,body{background:#ECE9E1}@media (prefers-color-scheme:dark){html,body{background:#0E0E0D}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
[data-rise]{animation-name:rise;animation-fill-mode:both;animation-timing-function:cubic-bezier(.16,1,.3,1)}
@media (prefers-reduced-motion:reduce){[data-rise]{animation:none!important}}`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return (
    <html lang="en-IN" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>Split & Settle — split bills, settle by UPI</title>
        <meta name="description" content="Split trip and flat expenses with friends, see who owes whom, and settle in one UPI tap. Free, no sign-up — join with a link." />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ECE9E1" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0E0E0D" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Split & Settle" />
        <meta property="og:title" content="Split & Settle" />
        <meta property="og:description" content="Split bills with friends. Settle in one UPI tap." />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: bg }} />
        <script dangerouslySetInnerHTML={{ __html: sw }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
