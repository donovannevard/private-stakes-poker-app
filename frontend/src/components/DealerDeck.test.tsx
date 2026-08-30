import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DealerDeck } from './DealerDeck';

describe('DealerDeck', () => {
  it('renders a stack of face-down cards', () => {
    render(<DealerDeck />);

    const deck = screen.getByTestId('dealer-deck');
    expect(deck.querySelectorAll('[data-testid="playing-card-back"]').length).toBeGreaterThan(1);
  });
});
