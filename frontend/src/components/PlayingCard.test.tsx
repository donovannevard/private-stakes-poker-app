import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayingCard } from './PlayingCard';

describe('PlayingCard', () => {
  it('renders a face-down back when card is null', () => {
    render(<PlayingCard card={null} />);

    expect(screen.getByTestId('playing-card-back')).toBeInTheDocument();
    expect(screen.queryByTestId('playing-card')).not.toBeInTheDocument();
  });

  it('renders rank and suit for a numbered card', () => {
    render(<PlayingCard card={{ rank: 7, suit: 'spades' }} />);

    const cardEl = screen.getByTestId('playing-card');
    expect(cardEl).toHaveTextContent('7');
    expect(cardEl).toHaveTextContent('♠');
  });

  it('renders the letter for face cards and aces', () => {
    render(<PlayingCard card={{ rank: 13, suit: 'hearts' }} />);

    expect(screen.getByTestId('playing-card')).toHaveTextContent('K');
  });

  it('colors red suits differently from black suits', () => {
    const { rerender } = render(<PlayingCard card={{ rank: 10, suit: 'diamonds' }} />);
    expect(screen.getByTestId('playing-card').className).toMatch(/text-red-600/);

    rerender(<PlayingCard card={{ rank: 10, suit: 'clubs' }} />);
    expect(screen.getByTestId('playing-card').className).toMatch(/text-neutral-900/);
  });
});
