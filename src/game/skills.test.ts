import { describe, expect, it } from 'vitest'
import { skillKey } from './skills'

describe('Git', () => {
  it('всё, что связано с git, — один навык Git', () => {
    for (const raw of ['GitHub', 'GitLab', 'GitHub Actions', 'GitLab CI/CD', 'Bitbucket', 'Version Control', 'GitOps', 'Git Flow', 'SourceTree'])
      expect(skillKey(raw)).toBe('git')
  })

  it('Agile, Communication, Leadership, MS Office, VS Code — по одному навыку', () => {
    for (const raw of ['Scrum', 'Kanban', 'SAFe', 'Agile Methodologies']) expect(skillKey(raw)).toBe('agile')
    for (const raw of ['Teamwork', 'Stakeholder Management', 'Public Speaking', 'Executive Communication']) expect(skillKey(raw)).toBe('communication')
    for (const raw of ['Mentoring', 'Team Leadership', 'Technical Leadership', 'Hiring']) expect(skillKey(raw)).toBe('leadership')
    for (const raw of ['Excel', 'Microsoft Word', 'PowerPoint', 'SharePoint', 'MS Teams']) expect(skillKey(raw)).toBe('msoffice')
    expect(skillKey('Visual Studio Code')).toBe('vscode')
    expect(skillKey('Visual Studio')).not.toBe('vscode')
  })
})
