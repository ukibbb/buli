import { renderEmbeddedGeistFontFaceDeclarations } from "./embeddedFonts.ts";

// External font URLs are deliberately omitted: the export must remain self-contained
// and tests assert no fonts.googleapis.com / fonts.gstatic.com requests leak in.
// Geist and Geist Mono ship inline as base64 woff2 inside @font-face declarations.
const sansFontStack = `"Geist", -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
const monoFontStack = `"Geist Mono", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;

export function renderConversationSessionExportStyles(): string {
  return `${renderEmbeddedGeistFontFaceDeclarations()}
:root{
  --background:0 0% 100%;
  --foreground:240 10% 3.9%;
  --card:0 0% 100%;
  --card-foreground:240 10% 3.9%;
  --popover:0 0% 100%;
  --popover-foreground:240 10% 3.9%;
  --primary:244 80% 48%;
  --primary-foreground:0 0% 98%;
  --secondary:240 5.5% 94%;
  --secondary-foreground:240 5.9% 10%;
  --muted:240 5.5% 94%;
  --muted-foreground:240 5% 32%;
  --accent:240 5.5% 90%;
  --accent-foreground:240 5.9% 10%;
  --destructive:0 78% 45%;
  --destructive-foreground:0 0% 98%;
  --border:240 6% 82%;
  --input:240 6% 82%;
  --ring:240 5.9% 10%;
  --role-user:244 80% 48%;
  --role-assistant:158 76% 30%;
  --role-tool:32 100% 40%;
  --role-result:158 76% 30%;
  --role-failed:0 78% 45%;
  --role-patch:262 75% 50%;
  --role-compaction:280 70% 44%;
  --code-bg:240 10% 3.9%;
  --code-border:240 6% 14%;
  --radius:0.5rem;
  --font-sans:${sansFontStack};
  --font-mono:${monoFontStack};
  --shadow-sm:0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.05);
  --text-xs:11px;
  --text-sm:12px;
  --text-base:13px;
  --text-md:14px;
  --text-lg:15px;
  --text-xl:17px;
  --text-2xl:20px;
  --text-3xl:24px;
  --text-display:clamp(28px, 4vw, 40px);
  --tracking-tight2:-0.04em;
  --tracking-tight:-0.02em;
  --tracking-normal:0;
  --tracking-wide:0.04em;
  --leading-tight:1.2;
  --leading-snug:1.4;
  --leading-normal:1.5;
  --leading-relaxed:1.65;
  --space-1:4px;
  --space-2:8px;
  --space-3:12px;
  --space-4:16px;
  --space-5:20px;
  --space-6:24px;
  --space-7:28px;
  --space-8:32px;
  --space-10:40px;
  --space-12:48px;
  --space-16:64px;
  --badge-bg-alpha:0.08;
}
html[data-theme="dark"]{
  --background:240 10% 3.9%;
  --foreground:0 0% 98%;
  --card:240 10% 3.9%;
  --card-foreground:0 0% 98%;
  --popover:240 10% 3.9%;
  --popover-foreground:0 0% 98%;
  --primary:244 80% 70%;
  --primary-foreground:240 5.9% 10%;
  --secondary:240 3.7% 15.9%;
  --secondary-foreground:0 0% 98%;
  --muted:240 3.7% 15.9%;
  --muted-foreground:240 5% 64.9%;
  --accent:240 3.7% 18%;
  --accent-foreground:0 0% 98%;
  --destructive:0 72% 51%;
  --destructive-foreground:0 0% 98%;
  --border:240 3.7% 15.9%;
  --input:240 3.7% 15.9%;
  --ring:240 4.9% 83.9%;
  --role-user:244 80% 70%;
  --role-assistant:158 64% 52%;
  --role-tool:38 92% 58%;
  --role-result:158 64% 52%;
  --role-failed:0 72% 65%;
  --role-patch:262 75% 72%;
  --role-compaction:280 70% 70%;
  --shadow-sm:0 1px 2px 0 rgb(0 0 0 / 0.4);
  --shadow-md:0 1px 3px 0 rgb(0 0 0 / 0.5), 0 1px 2px -1px rgb(0 0 0 / 0.4);
  --badge-bg-alpha:0.10;
}
@media (prefers-color-scheme: dark){
  html[data-theme="auto"]{
    --background:240 10% 3.9%;
    --foreground:0 0% 98%;
    --card:240 10% 3.9%;
    --card-foreground:0 0% 98%;
    --popover:240 10% 3.9%;
    --popover-foreground:0 0% 98%;
    --primary:244 80% 70%;
    --primary-foreground:240 5.9% 10%;
    --secondary:240 3.7% 15.9%;
    --secondary-foreground:0 0% 98%;
    --muted:240 3.7% 15.9%;
    --muted-foreground:240 5% 64.9%;
    --accent:240 3.7% 18%;
    --accent-foreground:0 0% 98%;
    --destructive:0 72% 51%;
    --destructive-foreground:0 0% 98%;
    --border:240 3.7% 15.9%;
    --input:240 3.7% 15.9%;
    --ring:240 4.9% 83.9%;
    --role-user:244 80% 70%;
    --role-assistant:158 64% 52%;
    --role-tool:38 92% 58%;
    --role-result:158 64% 52%;
    --role-failed:0 72% 65%;
    --role-patch:262 75% 72%;
    --role-compaction:280 70% 70%;
    --shadow-sm:0 1px 2px 0 rgb(0 0 0 / 0.4);
    --shadow-md:0 1px 3px 0 rgb(0 0 0 / 0.5), 0 1px 2px -1px rgb(0 0 0 / 0.4);
    --badge-bg-alpha:0.10;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
html,body{background:hsl(var(--background));color:hsl(var(--foreground))}
body{margin:0;font-family:var(--font-sans);font-size:var(--text-lg);line-height:var(--leading-relaxed);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:hsl(var(--primary) / 0.18)}
a{color:inherit;text-decoration:none}
.prose a{color:hsl(var(--primary));text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
:focus-visible{outline:none;box-shadow:0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));border-radius:calc(var(--radius) - 2px)}

.appbar{position:sticky;top:0;z-index:40;background:hsl(var(--background) / 0.85);backdrop-filter:saturate(180%) blur(8px);-webkit-backdrop-filter:saturate(180%) blur(8px);border-bottom:1px solid hsl(var(--border))}
.appbar-inner{max-width:1440px;margin:0 auto;padding:0 var(--space-6);height:56px;display:flex;align-items:center;gap:var(--space-3)}
.wordmark{font-family:var(--font-sans);font-weight:600;font-size:var(--text-lg);letter-spacing:var(--tracking-tight);color:hsl(var(--foreground))}
.appbar-sep{width:1px;height:18px;background:hsl(var(--border));margin:0 2px}
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:var(--text-base);color:hsl(var(--muted-foreground));min-width:0}
.breadcrumb-sep{color:hsl(var(--muted-foreground) / 0.5)}
.breadcrumb-leaf{font-family:var(--font-mono);font-size:var(--text-sm);color:hsl(var(--foreground));font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60ch}
.appbar-spacer{flex:1}
.appbar-actions{display:flex;align-items:center;gap:2px}
.iconbtn{appearance:none;background:transparent;border:1px solid transparent;color:hsl(var(--foreground));width:36px;height:36px;border-radius:calc(var(--radius) - 2px);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 200ms,color 200ms,border-color 200ms;padding:0}
.iconbtn:hover{background:hsl(var(--accent))}
.iconbtn svg{width:16px;height:16px}

.shell{max-width:1440px;margin:0 auto;padding:var(--space-6);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-8)}
@media (min-width:1280px){.shell{grid-template-columns:minmax(0,1fr) 220px;padding:var(--space-8) var(--space-8) 96px;gap:var(--space-12)}}
main{min-width:0;max-width:880px;margin:0 auto;width:100%}

.hero{padding-top:var(--space-4);margin-bottom:var(--space-8)}
.hero h1{font-size:var(--text-display);font-weight:600;letter-spacing:var(--tracking-tight2);line-height:var(--leading-tight);margin:0 0 var(--space-3)}
.hero h1 .id{font-family:var(--font-mono);font-weight:500;color:hsl(var(--muted-foreground));font-size:0.82em;letter-spacing:var(--tracking-tight)}
.hero .deck{font-size:var(--text-lg);line-height:var(--leading-relaxed);color:hsl(var(--muted-foreground));margin:0;max-width:68ch}
.hero .deck code{font-family:var(--font-mono);font-size:var(--text-base);background:hsl(var(--muted));color:hsl(var(--foreground));padding:1.5px 6px;border-radius:calc(var(--radius) - 4px);border:1px solid hsl(var(--border))}

.meta-grid{margin:var(--space-7) 0 var(--space-8);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-3)}
@media (max-width:980px){.meta-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.meta-card{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius);padding:var(--space-3) var(--space-4);transition:background-color 200ms,border-color 200ms}
.meta-card:hover{background:hsl(var(--accent) / 0.4)}
.meta-label{font-size:var(--text-xs);font-weight:500;text-transform:uppercase;letter-spacing:var(--tracking-wide);color:hsl(var(--muted-foreground));margin-bottom:6px}
.meta-value{font-size:var(--text-md);font-weight:500;color:hsl(var(--foreground));font-variant-numeric:tabular-nums;letter-spacing:var(--tracking-tight);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta-value.mono{font-family:var(--font-mono);font-size:var(--text-base)}

.trace{display:flex;align-items:center;gap:var(--space-3);margin:0 0 var(--space-6);padding:var(--space-3) var(--space-4);background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius)}
.trace-label{font-size:var(--text-xs);font-weight:500;text-transform:uppercase;letter-spacing:var(--tracking-wide);color:hsl(var(--muted-foreground));flex-shrink:0}
.trace-cells{display:flex;flex-wrap:wrap;gap:var(--space-1);min-width:0}
.trace-cell{width:12px;height:12px;border-radius:2px;background:hsl(var(--muted));cursor:pointer;transition:transform 120ms,box-shadow 120ms;display:inline-block;border:0;padding:0}
.trace-cell:hover{transform:scale(1.25);box-shadow:0 0 0 1px hsl(var(--ring) / 0.3)}
.trace-cell[data-role="user"]{background:hsl(var(--role-user) / 0.85)}
.trace-cell[data-role="assistant"]{background:hsl(var(--role-assistant) / 0.85)}
.trace-cell[data-role="tool"]{background:hsl(var(--role-tool) / 0.85)}
.trace-cell[data-role="result"]{background:hsl(var(--role-result) / 0.4)}
.trace-cell[data-role="failed"]{background:hsl(var(--role-failed) / 0.85)}
.trace-cell[data-role="patch"]{background:hsl(var(--role-patch) / 0.85)}
.trace-cell[data-role="compaction"]{background:hsl(var(--role-compaction) / 0.85)}

.rail{display:none}
@media (min-width:1280px){.rail{display:block;position:sticky;top:80px;align-self:start;max-height:calc(100vh - 96px);overflow-y:auto}}
.rail-title{font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:var(--tracking-wide);color:hsl(var(--muted-foreground));padding:6px var(--space-2);margin-bottom:var(--space-1)}
.rail-list{list-style:none;margin:0;padding:0}
.rail-item a{display:flex;align-items:flex-start;gap:var(--space-2);padding:6px var(--space-2);border-radius:calc(var(--radius) - 2px);font-size:var(--text-base);color:hsl(var(--muted-foreground));line-height:var(--leading-snug);transition:background-color 200ms,color 200ms;border-left:2px solid transparent;padding-left:10px}
.rail-item a:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
.rail-item.active a{color:hsl(var(--foreground));background:hsl(var(--accent) / 0.5);border-left-color:hsl(var(--primary));font-weight:500}
.rail-num{font-family:var(--font-mono);font-size:var(--text-xs);color:hsl(var(--muted-foreground));font-weight:500;flex-shrink:0;width:22px}
.rail-item.active .rail-num{color:hsl(var(--primary))}

.entry{border-top:1px solid hsl(var(--border));padding:var(--space-7) 0;scroll-margin-top:76px}
.entry:first-of-type{border-top-color:hsl(var(--border))}
.entry-header{display:flex;align-items:center;gap:10px;margin-bottom:var(--space-4)}
.entry-num{font-family:var(--font-mono);font-size:var(--text-xs);color:hsl(var(--muted-foreground));font-weight:500;letter-spacing:var(--tracking-tight);text-decoration:none;transition:color 200ms}
.entry-num:hover{color:hsl(var(--foreground))}
.entry-time{margin-left:auto;font-family:var(--font-mono);font-size:var(--text-xs);color:hsl(var(--muted-foreground));font-variant-numeric:tabular-nums}
.entry-body{min-width:0}
.entry.active{background:linear-gradient(90deg, hsl(var(--accent) / 0.4) 0%, transparent 60%);margin-left:calc(var(--space-4) * -1);padding-left:var(--space-4);border-radius:var(--radius)}

.badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:calc(var(--radius) - 2px);font-size:var(--text-xs);font-weight:600;letter-spacing:var(--tracking-wide);text-transform:uppercase;line-height:1;font-variant-numeric:tabular-nums;border:1.5px solid transparent;background:transparent;transition:background-color 200ms,border-color 200ms}
.badge-user{border-color:hsl(var(--role-user));color:hsl(var(--role-user));background:hsl(var(--role-user) / var(--badge-bg-alpha))}
.badge-assistant{border-color:hsl(var(--role-assistant));color:hsl(var(--role-assistant));background:hsl(var(--role-assistant) / var(--badge-bg-alpha))}
.badge-tool{background:hsl(var(--role-tool) / var(--badge-bg-alpha));color:hsl(var(--role-tool));border-color:hsl(var(--role-tool))}
.badge-result{border-color:hsl(var(--role-result));color:hsl(var(--role-result));background:hsl(var(--role-result) / var(--badge-bg-alpha))}
.badge-failed{border-color:hsl(var(--destructive));color:hsl(var(--destructive));background:hsl(var(--destructive) / var(--badge-bg-alpha))}
.badge-patch{border-color:hsl(var(--role-patch));color:hsl(var(--role-patch));background:hsl(var(--role-patch) / var(--badge-bg-alpha))}
.badge-compaction{border-color:hsl(var(--role-compaction));color:hsl(var(--role-compaction));background:hsl(var(--role-compaction) / var(--badge-bg-alpha))}

.prompt{font-size:var(--text-lg);line-height:var(--leading-relaxed);color:hsl(var(--foreground));font-style:italic;margin:0 0 var(--space-3);font-weight:400;white-space:pre-wrap}
.prompt code{font-family:var(--font-mono);font-style:normal;font-size:var(--text-base);background:hsl(var(--muted));color:hsl(var(--foreground));border:1px solid hsl(var(--border));padding:1px 6px;border-radius:calc(var(--radius) - 4px);margin:0 1px}
.user-image-attachment{margin:var(--space-4) 0 0;border:1px solid hsl(var(--border));border-radius:var(--radius);background:hsl(var(--muted));padding:var(--space-3);overflow:hidden}
.user-image-attachment img{display:block;max-width:100%;height:auto;border-radius:calc(var(--radius) - 2px);background:hsl(var(--background));min-height:32px;font-family:var(--font-mono);font-size:var(--text-xs);color:hsl(var(--muted-foreground));text-align:center;padding:var(--space-3);box-sizing:border-box;word-break:break-word}
.user-image-attachment figcaption{margin-top:var(--space-2);font:500 var(--text-xs)/var(--leading-snug) var(--font-mono);color:hsl(var(--muted-foreground))}

.alert{display:flex;gap:var(--space-3);padding:var(--space-3) var(--space-4);border-radius:var(--radius);border:1px solid hsl(var(--border));background:hsl(var(--card));margin:var(--space-3) 0 0}
.alert svg{width:16px;height:16px;flex-shrink:0;margin-top:2px}
.alert-title{font-size:var(--text-md);font-weight:500;line-height:var(--leading-snug);margin:0 0 2px;color:hsl(var(--foreground))}
.alert-desc{font-size:var(--text-base);line-height:var(--leading-normal);color:hsl(var(--muted-foreground));margin:0}
.alert-desc code{font-family:var(--font-mono);font-size:var(--text-sm);background:hsl(var(--muted));border:1px solid hsl(var(--border));padding:0 var(--space-1);border-radius:4px}
.alert.info svg{color:hsl(var(--primary))}
.alert.fail{border-color:hsl(var(--destructive) / 0.4);background:hsl(var(--destructive) / 0.06)}
.alert.fail svg{color:hsl(var(--destructive))}
.alert.fail .alert-title{color:hsl(var(--destructive))}
.alert.warn{border-color:hsl(var(--role-tool) / 0.4);background:hsl(var(--role-tool) / 0.06)}
.alert.warn svg{color:hsl(var(--role-tool))}
.alert.warn .alert-title{color:hsl(var(--role-tool))}

.panel{border:1px solid hsl(var(--border));border-radius:var(--radius);background:hsl(var(--card));overflow:hidden;margin:var(--space-2) 0 0}
.panel--result{border-left:2px solid hsl(var(--role-result) / 0.6)}
.panel--failed{border-left:2px solid hsl(var(--destructive) / 0.7)}
.panel-head{display:flex;align-items:center;gap:10px;padding:var(--space-3) var(--space-4);background:hsl(var(--muted) / 0.5)}
.panel-icon{width:16px;height:16px;color:hsl(var(--muted-foreground));flex-shrink:0}
.panel-tool{font-family:var(--font-mono);font-size:var(--text-base);font-weight:500;color:hsl(var(--foreground));letter-spacing:var(--tracking-normal)}
.panel-purpose{font-size:var(--text-base);color:hsl(var(--muted-foreground));font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.panel-status{margin-left:auto;display:inline-flex;align-items:center;height:20px;padding:0 var(--space-2);border-radius:999px;font-size:var(--text-xs);font-weight:500;line-height:1;font-variant-numeric:tabular-nums;background:hsl(var(--muted));color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));text-transform:lowercase}
.panel-status.ok{background:hsl(var(--role-result) / 0.08);color:hsl(var(--role-result));border-color:hsl(var(--role-result) / 0.3)}
.panel-status.fail{background:hsl(var(--destructive) / 0.08);color:hsl(var(--destructive));border-color:hsl(var(--destructive) / 0.3)}
.panel-status.warn{background:hsl(var(--role-tool) / 0.08);color:hsl(var(--role-tool));border-color:hsl(var(--role-tool) / 0.3)}
.panel-body{padding:var(--space-3) var(--space-4);font-family:var(--font-mono);font-size:var(--text-sm);line-height:var(--leading-relaxed);color:hsl(var(--foreground))}
.panel-body p{margin:0 0 var(--space-2)}
.panel-body p:last-child{margin-bottom:0}
.panel-body .arg{display:flex;gap:var(--space-2);align-items:baseline}
.panel-body .arg b{color:hsl(var(--muted-foreground));font-weight:500}
.panel-body pre.cmd, .panel-body pre.output{margin:0;padding:var(--space-2) var(--space-3);background:hsl(var(--muted) / 0.6);border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 4px);font-family:var(--font-mono);font-size:var(--text-sm);line-height:var(--leading-relaxed);color:hsl(var(--foreground));overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.panel-body pre.cmd{background:hsl(var(--code-bg));color:hsl(0 0% 92%);border-color:hsl(var(--code-border))}
.panel-body pre.cmd::before{content:"$ ";color:hsl(0 0% 60%)}
.panel-body .panel-section{margin-top:var(--space-3)}
.panel-body .panel-section:first-child{margin-top:0}
.panel-body .panel-section-label{font-family:var(--font-sans);font-size:var(--text-xs);font-weight:500;text-transform:uppercase;letter-spacing:var(--tracking-wide);color:hsl(var(--muted-foreground));margin-bottom:6px}
.panel-body .panel-notice{margin:var(--space-2) 0 0;font-family:var(--font-sans);font-size:var(--text-base);color:hsl(var(--muted-foreground));font-style:italic}
.panel-body .panel-notice.fail{color:hsl(var(--destructive));font-style:normal}
.panel-body .panel-notice.warn{color:hsl(var(--role-tool));font-style:normal}

.subagent-list{list-style:none;margin:var(--space-2) 0 0;padding:0;display:grid;gap:var(--space-2)}
.subagent-list>li{border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 4px);padding:var(--space-2) var(--space-3);background:hsl(var(--muted) / 0.4)}

.dir-list, .grep-list{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.dir-list{grid-template-columns:repeat(auto-fill, minmax(180px,1fr))}
.dir-list li{display:flex;align-items:center;gap:var(--space-2);font-family:var(--font-mono);font-size:var(--text-sm);padding:2px 0}
.dir-kind{display:inline-flex;align-items:center;justify-content:center;width:26px;font-size:var(--text-xs);font-weight:500;color:hsl(var(--muted-foreground));background:hsl(var(--muted));border-radius:3px;padding:1px 0;border:1px solid hsl(var(--border))}
.dir-folder .dir-kind{color:hsl(var(--primary));border-color:hsl(var(--primary) / 0.3);background:hsl(var(--primary) / 0.06)}
.dir-name{font-family:var(--font-mono);color:hsl(var(--foreground))}

.prose{font-size:var(--text-lg);line-height:var(--leading-relaxed);color:hsl(var(--foreground))}
.prose h1, .prose h2{font-size:var(--text-3xl);font-weight:600;letter-spacing:var(--tracking-tight);line-height:var(--leading-tight);margin:0 0 var(--space-3)}
.prose h3{font-size:var(--text-2xl);font-weight:600;letter-spacing:var(--tracking-tight);line-height:var(--leading-snug);margin:var(--space-6) 0 var(--space-2)}
.prose h4{font-size:var(--text-xl);font-weight:600;letter-spacing:var(--tracking-tight);line-height:var(--leading-snug);margin:var(--space-5) 0 var(--space-2)}
.prose p{margin:0 0 var(--space-4)}
.prose ul, .prose ol{margin:var(--space-3) 0 var(--space-4);padding-left:22px}
.prose li{margin:var(--space-1) 0}
.prose li b, .prose li strong{font-weight:600;color:hsl(var(--foreground))}
.prose code{position:relative;font-family:var(--font-mono);font-size:0.86em;background:hsl(var(--muted));color:hsl(var(--foreground));padding:1.5px 6px;border-radius:calc(var(--radius) - 4px);border:1px solid hsl(var(--border))}
.prose blockquote{border-left:2px solid hsl(var(--border));padding-left:var(--space-5);margin:var(--space-4) 0;color:hsl(var(--muted-foreground));font-style:italic}
.prose blockquote p{margin:0}

.code-wrap{margin:var(--space-4) 0}
.code-tab{display:inline-flex;align-items:center;gap:var(--space-2);padding:6px var(--space-3);background:hsl(var(--code-bg));color:hsl(0 0% 80%);font-family:var(--font-mono);font-size:var(--text-sm);border:1px solid hsl(var(--code-border));border-bottom:none;border-top-left-radius:var(--radius);border-top-right-radius:var(--radius);font-weight:500}
.code-tab svg{width:13px;height:13px;color:hsl(0 0% 60%)}
.code-block{position:relative;background:hsl(var(--code-bg));color:hsl(0 0% 92%);border:1px solid hsl(var(--code-border));border-radius:var(--radius);border-top-left-radius:0;overflow:hidden}
.code-block pre{margin:0;padding:var(--space-4);overflow-x:auto;font-family:var(--font-mono);font-size:var(--text-base);line-height:var(--leading-relaxed);color:hsl(0 0% 92%);background:transparent !important}
.code-block pre.shiki{background:transparent !important}
.code-block pre code{font-family:var(--font-mono);background:transparent;border:0;padding:0}
.copy-btn{appearance:none;position:absolute;top:var(--space-2);right:var(--space-2);background:transparent;border:1px solid transparent;color:hsl(0 0% 60%);width:28px;height:28px;border-radius:calc(var(--radius) - 2px);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background-color 200ms,color 200ms;padding:0;z-index:2}
.copy-btn:hover{background:hsl(0 0% 100% / 0.06);color:hsl(0 0% 90%)}
.copy-btn svg{width:14px;height:14px}
.copy-btn .check{display:none;color:hsl(var(--role-result))}
.copy-btn[data-copied="true"] .copy{display:none}
.copy-btn[data-copied="true"] .check{display:inline-block}

.patch{margin:var(--space-1) 0 0;border:1px solid hsl(var(--border));border-radius:var(--radius);overflow:hidden;background:hsl(var(--card))}
.patch-head{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);background:hsl(var(--muted) / 0.5);border-bottom:1px solid hsl(var(--border));flex-wrap:wrap}
.patch-file{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:var(--text-sm);font-weight:500;color:hsl(var(--foreground));padding:3px var(--space-2);border-radius:calc(var(--radius) - 4px);background:hsl(var(--background));border:1px solid hsl(var(--border))}
.patch-file svg{width:13px;height:13px;color:hsl(var(--muted-foreground))}
.patch-stats{margin-left:auto;display:inline-flex;gap:var(--space-2);font-family:var(--font-mono);font-size:var(--text-sm);font-weight:500;font-variant-numeric:tabular-nums}
.patch-stats .add{color:hsl(var(--role-result))}
.patch-stats .del{color:hsl(var(--destructive))}
.patch-diff{margin:0}
.patch-diff pre.shiki{margin:0;padding:var(--space-3) var(--space-4);background:hsl(var(--code-bg)) !important;color:hsl(0 0% 92%);font-family:var(--font-mono);font-size:var(--text-sm);line-height:var(--leading-relaxed);overflow-x:auto}

.empty-state{margin:var(--space-8) 0;padding:var(--space-6);border:1px dashed hsl(var(--border));border-radius:var(--radius);color:hsl(var(--muted-foreground));text-align:center;font-style:italic}

.totop{position:fixed;right:var(--space-5);bottom:var(--space-5);appearance:none;background:hsl(var(--background));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 2px);width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-md);opacity:0;pointer-events:none;transition:opacity 200ms,transform 200ms,background-color 200ms;transform:translateY(8px);z-index:30}
.totop.visible{opacity:1;pointer-events:auto;transform:translateY(0)}
.totop:hover{background:hsl(var(--accent))}
.totop svg{width:14px;height:14px}

.dialog-backdrop{position:fixed;inset:0;background:hsl(var(--foreground) / 0.4);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:none;align-items:center;justify-content:center;z-index:50}
.dialog-backdrop.open{display:flex}
.dialog{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:var(--shadow-md), 0 10px 38px -10px rgb(0 0 0 / 0.35);width:min(420px, calc(100vw - var(--space-8)));padding:var(--space-5)}
.dialog h3{margin:0 0 var(--space-1);font-size:var(--text-lg);font-weight:600;letter-spacing:var(--tracking-tight)}
.dialog p{margin:0 0 var(--space-4);font-size:var(--text-base);color:hsl(var(--muted-foreground))}
.dialog-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-2)}
.dialog-list li{display:flex;align-items:center;justify-content:space-between;font-size:var(--text-base)}
.dialog-list span{color:hsl(var(--muted-foreground))}
kbd{font-family:var(--font-mono);font-size:var(--text-xs);padding:2px 6px;background:hsl(var(--muted));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-bottom-width:2px;border-radius:4px;line-height:1;font-weight:500}

@media print{
  .appbar,.totop,.rail,.trace,.copy-btn,.dialog-backdrop{display:none !important}
  body{background:white;color:black}
  .shell{padding:0;max-width:none;display:block}
  main{max-width:none;margin:0}
  .entry{break-inside:avoid;page-break-inside:avoid}
  .code-block,.patch-diff pre.shiki{background:#f5f5f5 !important;color:black !important}
  .code-block pre{color:black !important}
}`;
}
