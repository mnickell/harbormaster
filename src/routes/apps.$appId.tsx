import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/apps/$appId')({
  component: AppLayout,
})

function AppLayout() {
  return <Outlet />
}
