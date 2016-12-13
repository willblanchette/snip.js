const config = {
  rateLimit: 30 // Only run once per hour, max
};

const jsdom = require('jsdom');
const express = require('express');
const redis = require('redis').createClient(process.env.REDIS_URL);
const vm = require('vm');

const app = express();
const cache = {};

// Fetch my beer count from untappd

cache.beers = {
  url: 'http://untappd.com/user/wblanchette',
  expression: `document.querySelector('.stats [data-href=":stats/beerhistory"]').innerHTML.replace(/[^0-9]/g, '');`
};

// Fetch my game count from steam

cache.games = {
  url: 'http://steamcommunity.com/profiles/76561197976583032',
  expression: `document.querySelectorAll('.profile_count_link_total')[1].innerHTML.replace(/[^0-9]/g, '')`
};

// Fetch my song count from soundcloud

cache.songs = {
    url: 'http://soundcloud.com/will-blanchette',
    expression: `document.querySelector('[property="soundcloud:sound_count"]').content`
};

// Fetch a count of my github repos

cache.repos = {
  url: 'https://github.com/collectivecognition?tab=repositories',
  expression: `document.querySelector("a[href='/collectivecognition?tab=repositories'] .counter").innerText`
};

// Expose the api

app.get('/:token', (req, res) => {
  const token = req.params.token;
  const job = cache[token];

  if (job) {
    const now = (new Date()).getTime();

    redis.get(token, (err, data) => {
      if (!data || (job.timestamp && now - job.timestamp >= config.rateLimit)) {
        if (data) {
          res.jsonp(data); // Return right away
        }
        if (!job.fetching) {
          job.fetching = true;

          jsdom.env({
            url: job.url,
            features: {},
            done: (err, window) => {
              try {
                const script = new vm.Script(job.expression, {});
                const result = jsdom.evalVMScript(window, script);
                redis.set(token, result);
                job.timestamp = now;
                job.fetching = false;
                res.jsonp(result);
              } catch(e) {
                res.status(500).jsonp(null);
              }
            }
          });
        }
      } else {
        res.jsonp(data);
      }
    });
  } else {
    res.status(404).jsonp(null);
  }
});

app.listen(process.env.PORT || 3000, () => {});
