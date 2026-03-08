import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { ToastProvider } from '~/hooks/useToast'
import globalCss from '~/styles/global.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'Harbormaster' },
    ],
    links: [{ rel: 'stylesheet', href: globalCss }],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ToastProvider>
          <header>
            <div className="header-left">
              <h1>
                <Link to="/">Harbormaster</Link>
              </h1>
            </div>
            <div className="header-right">
              <Link to="/apps/new" className="btn btn-primary">
                + Add App
              </Link>
              <Link to="/ports" className="btn btn-ghost">
                Ports
              </Link>
              <Link to="/settings" className="btn btn-ghost">
                Settings
              </Link>
            </div>
          </header>
          <main>
            <Outlet />
          </main>
        </ToastProvider>
      </body>
    </html>
  )
}
