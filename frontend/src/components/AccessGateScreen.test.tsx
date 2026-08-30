import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitAccessCode } from '../lib/api';
import { AccessGateScreen } from './AccessGateScreen';

vi.mock('../lib/api', () => ({
  submitAccessCode: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderGate(onGranted: () => void = vi.fn()) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AccessGateScreen onGranted={onGranted} />
    </QueryClientProvider>,
  );
}

describe('AccessGateScreen', () => {
  it('disables Enter until a full 6-digit code is entered', () => {
    renderGate();

    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '12345' } });
    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();
  });

  it('strips non-digit characters and caps input at 6 characters', () => {
    renderGate();

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: 'a1b2c3d4e5f6' },
    });

    expect(screen.getByPlaceholderText('000000')).toHaveValue('123456');
  });

  it('submits the code and calls onGranted on success', async () => {
    vi.mocked(submitAccessCode).mockResolvedValue(undefined);
    const onGranted = vi.fn();
    renderGate(onGranted);

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalled();
    });
    expect(submitAccessCode).toHaveBeenCalledWith('123456');
  });

  it('shows an error and does not call onGranted on an incorrect code', async () => {
    vi.mocked(submitAccessCode).mockRejectedValue(new Error('incorrect code'));
    const onGranted = vi.fn();
    renderGate(onGranted);

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(await screen.findByText('Incorrect code. Try again.')).toBeInTheDocument();
    expect(onGranted).not.toHaveBeenCalled();
  });
});
