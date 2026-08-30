interface ErrorBannerProps {
  readonly message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 bg-red-900 px-4 py-2 text-center text-sm text-red-100"
    >
      {message}
    </div>
  );
}
