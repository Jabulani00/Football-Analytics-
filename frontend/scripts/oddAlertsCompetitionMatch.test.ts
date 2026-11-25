import {
  matchingOddAlertsCompetitionIds,
  oddAlertsCompetitionSearchTerm,
} from '../services/oddAlertsCompetitionMatch';

function check(name: string, value: boolean): void {
  if (!value) throw new Error(`Failed: ${name}`);
  console.log(`✓ ${name}`);
}

check('South African PSL search uses the provider league alias',
  oddAlertsCompetitionSearchTerm('PSL (Early Betting)', 'South Africa') === 'Premier League');
check('competition matching requires the exact country and league alias',
  matchingOddAlertsCompetitionIds('PSL (Early Betting)', 'South Africa', [
    { id: 11, name: 'Premier League', country: 'South Africa' },
    { id: 12, name: 'Premier League', country: 'England' },
  ]).join(',') === '11');
check('ambiguous exact competition matches fail closed',
  matchingOddAlertsCompetitionIds('Premier League', 'England', [
    { id: 21, name: 'Premier League', country: 'England' },
    { id: 22, name: 'Premier League', country: 'England' },
  ]).length === 2);
