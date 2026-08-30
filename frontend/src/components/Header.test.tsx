import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('shows the brand name', () => {
    render(<Header />);

    expect(screen.getByText('Lightning Self-Hosted Poker')).toBeInTheDocument();
  });

  it('shows the practice-table notice only when practiceMode is true', () => {
    const { rerender } = render(<Header practiceMode={false} />);
    expect(screen.queryByText(/Practice table/)).not.toBeInTheDocument();

    rerender(<Header practiceMode={true} />);
    expect(screen.getByText(/Practice table/)).toBeInTheDocument();
  });
});
