Portions of AppName are derived from JustHireMe by vasu-devs.
Source: https://github.com/vasu-devs/justhireme

MIT License

Copyright (c) 2024 vasu-devs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

────────────────────────────────────────────────────────────────────────
Specific files / patterns derived from JustHireMe in AppName:
  - backend/agents/justhireme/  (entire directory — quality_gate, scoring_engine,
    free_scout, lead_intel, evaluator, feedback_ranker, generator,
    github_ingestor, linkedin_parser, logger, portfolio_ingestor, query_gen)
  - backend/agents/sources/     (Greenhouse/Lever/Ashby/Workable adapter
    pattern; HTML stripping; remote-type heuristics)
  - backend/jobs/pipeline.py    (quality_gate + Haiku tagger pipeline order)
  - desktop/src-tauri/          (sidecar spawn pattern, port discovery,
    tray + minimize-to-tray, Stronghold integration)
