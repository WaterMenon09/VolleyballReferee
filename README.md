# Volleyball Referee

A comprehensive web-based volleyball scoresheet application for tracking matches, rotations, substitutions, and more. Works seamlessly on desktop and mobile browsers.

## Live Demo

**[https://watermenon09.github.io/VolleyballReferee/](https://watermenon09.github.io/VolleyballReferee/)**

## Features

### Match Setup

- **Best of 3 or 5 sets** - Choose your match format
- **Team customization** - Set team names, jersey numbers, captain, and libero
- **Custom team colors** - Color picker with preset swatches, persisted across sessions
- **Jersey flexibility** - Numbers, letters, and emojis supported (up to 3 characters)
- **Input validation** - Ensures valid jerseys with no duplicates

### Scoring

- **Live score tracking** - Track points for each team with large, easy-to-tap buttons
- **Set management** - Automatic set progression (25 points, final set to 15)
- **Win by 2** - Proper volleyball scoring rules enforced
- **Visual score log** - Timeline showing point-by-point scoring history
- **Undo** - Revert the last point if entered incorrectly; works even after team swaps

### Rotation System

- **Starting rotation setup** - Assign players to positions by clicking or drag-and-drop
- **Drag-and-drop** - Drag players from the palette or swap filled slots directly
- **Repeat previous rotation** - One-tap button to reuse the previous set's starting rotation per team
- **Automatic rotation** - Players rotate clockwise on side-out
- **Position display** - Visual 6-position grid (4-3-2 / 5-6-1 format)
- **Captain indicator** - Underlined jersey number for team captain
- **First server indicator** - Volleyball icon shows which team served first

### Substitutions

- **Player substitutions** - Tap any player in rotation to substitute
- **Libero management** - Special libero rules enforced:
  - Can only enter in back row positions (1, 5, 6)
  - Automatically exits when rotated to front row
  - Distinct green color for easy identification
- **Sub tracking** - Small indicator shows original player for each substitution
- **Volleyball rules** - Players can only return to their original position

### Match Results

- **Final summary** - Set scores with total points across all sets
- **Lead-margin charts** - Per-set score progression chart for both teams; trailing team dimmed at each segment
- **Match control** - Return to setup at any time during the match

### Additional Features

- **Service tracking** - Visual indicator shows which team is serving
- **Timeout management** - 2 timeouts per set with 30-second countdown timer
- **Team swap** - Switch sides with all data preserved, including undo history
- **Set break timer** - 3-minute break timer between sets
- **Responsive design** - Works on desktop, tablet, and mobile devices

## Installation

No installation required! Simply open `index.html` in any modern web browser.

### For Local Development

```bash
git clone https://github.com/watermenon09/VolleyballReferee.git
cd VolleyballReferee
# Open index.html in your browser
```

## Usage

1. **Setup Match**
   - Enter team names and jersey numbers (comma-separated, minimum 6)
   - Optionally set captain and libero numbers
   - Pick team colors using the color picker or preset swatches
   - Choose best of 3 or 5 sets

2. **Set Starting Rotation**
   - Click a position to select it, then click a jersey from the palette — or drag jerseys directly into slots
   - Use "Use previous rotation" (shown from set 2 onward) to instantly fill a team's rotation from the prior set
   - Libero cannot be in starting rotation

3. **During the Match**
   - Tap score buttons to add points
   - Tap players in rotation grid to make substitutions
   - Use timeout button when needed
   - Tap the volleyball icon to manually switch service
   - Use the undo button to revert a point

4. **Between Sets**
   - A 3-minute set break timer shows automatically
   - Set up new starting rotations, or reuse the previous set's rotation with one tap

5. **Match Result**
   - Final score, set breakdown, total points, and per-set score charts

## Technologies Used

- HTML5
- CSS3 (with CSS Variables and Flexbox)
- Vanilla JavaScript (ES6+)
- No external dependencies

## Browser Support

- Chrome (recommended)
- Safari (iOS and macOS)
- Firefox
- Edge
- Samsung Internet

## Mobile Support

The app is fully responsive and optimized for:

- iOS Safari (iPhone and iPad)
- Android Chrome
- Supports notched devices (safe area insets)
- Can be added to home screen as a web app

## Version History

- **v3.0** - Drag-and-drop rotation assignment; customizable team colors; letter/emoji jerseys; lead-margin charts; total points; return-to-setup mid-match; "use previous rotation" button; polished indoor arena theme
- **v2.01** - Optimized landscape mode for mobile phones, reduced scrolling
- **v1.7** - Added live demo link and GitHub Actions deployment
- **v1.5** - Added README and deployment documentation
- **v1.4** - Mobile responsiveness, substitution system, rotation management
- **v1.3** - Added timeout timer with countdown
- **v1.2** - Score timeline and service tracking
- **v1.1** - Basic scoring and set management
- **v1.0** - Initial release

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Created by **Menon Pranto**

## Contributing

You can also open GitHub issues to suggest new features or report bugs.
