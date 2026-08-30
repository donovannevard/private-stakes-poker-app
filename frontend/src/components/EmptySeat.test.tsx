import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptySeat } from './EmptySeat';

describe('EmptySeat', () => {
  it('shows "Add Bot" only when canAddBot is true, and calls onAddBot when clicked', () => {
    const onAddBot = vi.fn();
    const { rerender } = render(<EmptySeat canAddBot={false} onAddBot={onAddBot} />);
    expect(screen.queryByRole('button', { name: 'Add Bot' })).not.toBeInTheDocument();

    rerender(<EmptySeat canAddBot={true} onAddBot={onAddBot} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Bot' }));

    expect(onAddBot).toHaveBeenCalledTimes(1);
  });
});
