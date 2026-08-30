import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChipStack } from './ChipStack';

describe('ChipStack', () => {
  it('renders nothing when the pot is empty', () => {
    render(<ChipStack pot={0} bigBlind={2} />);

    expect(screen.queryByTestId('chip-stack')).not.toBeInTheDocument();
  });

  it('renders more chips as the pot grows relative to the big blind', () => {
    render(<ChipStack pot={2} bigBlind={2} />);
    const small = screen.getByTestId('chip-stack').children.length;

    render(<ChipStack pot={200} bigBlind={2} />);
    const large = screen.getAllByTestId('chip-stack').at(-1)!.children.length;

    expect(large).toBeGreaterThan(small);
  });
});
