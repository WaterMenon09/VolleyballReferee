# Volleyball Referee

A comprehensive web-based volleyball scoresheet application for tracking matches, rotations, substitutions, and more. Works seamlessly on desktop and mobile browsers.

## Features

### Match Setup

- **Best of 3 or 5 sets** - Choose your match format
- **Team customization** - Set team names, jersey numbers, captain, and libero
- **Input validation** - Ensures valid jersey numbers with no duplicates

### Scoring

- **Live score tracking** - Track points for each team with large, easy-to-tap buttons
- **Set management** - Automatic set progression (25 points, final set to 15)
- **Win by 2** - Proper volleyball scoring rules enforced
- **Visual score log** - Timeline showing point-by-point scoring history

### Rotation System

- **Starting rotation setup** - Manually assign players to positions at the start of each set
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

### Additional Features

- **Service tracking** - Visual indicator shows which team is serving
- **Timeout management** - 2 timeouts per set with 30-second countdown timer
- **Undo functionality** - Revert the last point if entered incorrectly
- **Team swap** - Switch sides with all data preserved
- **Responsive design** - Works on desktop, tablet, and mobile devices

## Screenshots

The app features a modern dark theme with color-coded teams (blue and red) for easy differentiation.

## Installation

No installation required! Simply open `index.html` in any modern web browser.

### For Local Development

```bash
git clone https://github.com/yourusername/VolleyballReferee.git
cd VolleyballReferee
# Open index.html in your browser
```

## Usage

1. **Setup Match**
   - Enter team names
   - Add jersey numbers (comma-separated, minimum 6)
   - Set captain and libero numbers
   - Choose best of 3 or 5 sets

2. **Set Starting Rotation**
   - Click on each position in the grid
   - Select a player from available jersey numbers
   - Libero cannot be in starting rotation

3. **During the Match**
   - Tap "+1 Point" to score for either team
   - Tap players in rotation grid to make substitutions
   - Use timeout button when needed
   - Tap the volleyball icon to manually switch service
   - Use undo button if you make a mistake

4. **Between Sets**
   - Set up new starting rotations for both teams
   - Match score is displayed for reference

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

Contributions are welcome! Please feel free to submit a Pull Request.
