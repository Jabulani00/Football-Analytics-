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

check('Hollywood SA PSL label searches the provider Premier League alias',
  oddAlertsCompetitionSearchTerm('SA PSL', 'South Africa') === 'Premier League');
check('SA PSL matches only the South African provider competition',
  matchingOddAlertsCompetitionIds('SA PSL', 'South Africa', [
    { id: 11, name: 'Premier League', country: 'South Africa' },
    { id: 12, name: 'Premier League', country: 'England' },
    { id: 13, name: 'Premier League Reserves', country: 'South Africa' },
  ]).join(',') === '11');
check('SA PSL early-betting suffix resolves consistently',
  matchingOddAlertsCompetitionIds('SA PSL (Early Betting)', 'South Africa', [
    { id: 11, name: 'Premier Soccer League', country: 'South Africa' },
  ]).join(',') === '11');
check('SA PSL alias is never applied outside South Africa',
  matchingOddAlertsCompetitionIds('SA PSL', 'England', [
    { id: 12, name: 'Premier League', country: 'England' },
  ]).length === 0);
