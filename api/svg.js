export const config = {
  runtime: 'edge',
};

const ALLOWED_USER = 'a104437ana';

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_PT   = ['','Seg','','Qua','','Sex',''];
const DAYS_EN   = ['','Mon','','Wed','','Fri',''];

function getLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function generateSVG(weeks, theme, lang) {
  const isDark = theme === 'dark';
  const MONTHS = lang === 'pt' ? MONTHS_PT : MONTHS_EN;
  const DAYS   = lang === 'pt' ? DAYS_PT   : DAYS_EN;

  const colors = isDark
    ? {
        bg:     'transparent',
        empty:  '#161b22',
        stroke: '#21262d',
        c1:     '#5a1a2e',
        c2:     '#a0284d',
        c3:     '#d94f7a',
        c4:     '#ff6b9d',
      }
    : {
        bg:     'transparent',
        empty:  '#ebedf0',
        stroke: '#d0d7de',
        c1:     '#ffc8d8',
        c2:     '#ff8fab',
        c3:     '#e8547a',
        c4:     '#c2185b',
      };

  const levelColors = ['', colors.c1, colors.c2, colors.c3, colors.c4];
  const labelColor  = isDark ? '#ffffff' : '#000000';

  const cellSize = 11, gap = 2, step = cellSize + gap;
  const paddingLeft = 28, paddingTop = 32, paddingRight = 20, paddingBottom = 20;
  const graphW = weeks.length * step;
  const W = graphW + paddingLeft + paddingRight;
  const H = 7 * step + paddingTop + paddingBottom;

  let cells = '';
  let monthMarkers = {};

  weeks.forEach((week, wi) => {
    const firstDay = week.contributionDays[0];
    if (firstDay) {
      const m = new Date(firstDay.date).getMonth();
      if (monthMarkers[m] === undefined) monthMarkers[m] = wi;
    }
    week.contributionDays.forEach(day => {
      const dow = new Date(day.date).getDay();
      const x = paddingLeft + wi * step;
      const y = paddingTop + dow * step;
      const level = getLevel(day.contributionCount);
      const fill = level === 0 ? colors.empty : levelColors[level];
      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}" stroke="${colors.stroke}" stroke-width="0.5" />`;
    });
  });

  let monthLabels = '';
  Object.entries(monthMarkers).forEach(([m, wi]) => {
    const x = paddingLeft + wi * step;
    monthLabels += `<text x="${x}" y="${paddingTop - 8}" font-size="9" fill="${labelColor}" font-family="monospace">${MONTHS[m]}</text>`;
  });

  let dayLabels = '';
  DAYS.forEach((d, i) => {
    if (d) dayLabels += `<text x="${paddingLeft - 4}" y="${paddingTop + i * step + cellSize - 2}" font-size="8" fill="${labelColor}" font-family="monospace" text-anchor="end">${d}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="10" fill="${colors.bg}" />
  ${monthLabels}
  ${dayLabels}
  ${cells}
</svg>`;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const theme    = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const lang     = searchParams.get('lang')  === 'pt'   ? 'pt'   : 'en';

  if (!username || username !== ALLOWED_USER) {
    return new Response('Unauthorized', { status: 401 });
  }

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          username,
          from: oneYearAgo.toISOString(),
          to: today.toISOString(),
        },
      }),
    });

    const data = await response.json();
    if (data.errors || !data.data.user) {
      return new Response('User not found', { status: 404 });
    }

    const cal = data.data.user.contributionsCollection.contributionCalendar;
    const svg = generateSVG(cal.weeks, theme, lang);

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Error generating SVG', { status: 500 });
  }
}
