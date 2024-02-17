import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import fetchWithAuth from '../functions/FetchWithAuth';
import { ThemeContext } from './ThemeContext';
import markdownToTxt from 'markdown-to-txt';

const baseUrl = process.env.REACT_APP_API_BASE_URL;
console.log('Base URL isadfadsfadsf', baseUrl)


const PDFView = () => {
    console.log('HELLO');

  const { theme, toggleTheme } = useContext(ThemeContext);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lines, setLines] = useState([]);
  const [bookTitle, setTitle] = useState([]);
  const [error, setError] = useState(null);
  const { bookid } = useParams(); // Access the id parameter
  const [isAuthenticated, setIsAuthenticated] = useState(false);
 
  useEffect(() => {
    // Check if the user is authenticated when the app loads
    const token = localStorage.getItem('authToken');
    setIsAuthenticated(!!token);
  }, []);


  //Get All Lines in a Book
  const fetchLines = () => {
    fetch(`${baseUrl}/books/${bookid}/lines`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setTitle(data.title);
        setLines(data.lines);
      })
      .catch((error) => {
        setError(error.message);
      });
  };

  useEffect(() => {
    fetchLines();
  }, []);

  const generateLatexForLines = (lines) => {
    return lines.map(line => {
      // Start building the LaTeX string for each line
      let latex = `
\\newline
\\begin{otherlanguage}{arabic}
\\begin{markdown}
  ${line.Arabic}
  \\end{markdown}
  \\end{otherlanguage}
  \\newline
  \\begin{markdown}
${line.English}
  \\end{markdown}

  `;
  
      // Only add commentary formatting if Commentary is not empty
      if (line.commentary && line.commentary.trim() !== '') {
        latex += `
  % Commentary formatting
  \\vspace{1em} % Add some vertical space before the commentary
  \\fontsize{8pt}{10pt}\\selectfont
  \\begin{markdown}
${line.commentary}
  \\end{markdown}
  \\normalsize % Reset to the normal font size and line spacing for the document

  `;
      }
      else{
          latex += `
          \\normalsize % Reset to the normal font size and line spacing for the document
          `;
      }
  
      return latex;
    }).join('\n');
  };
  

  // Complete LaTeX document
  const latexDocument = `
  \\documentclass[12pt]{scrartcl}
  \\usepackage[hashEnumerators,smartEllipses]{markdown}
  
    % \\usepackage{silence}
    % \\WarningFilter{latex}{Command InputIfFileExists}
    
    %%% For accessing system, OTF and TTF fonts
    %%% (would have been loaded by polylossia anyway)
  \\usepackage{fontspec}
   % \\usepackage{xunicode} %% loading this first to avoid clash with bidi/arabic
    
  %%% For language switching
  \\usepackage[main=english,bidi=default]{babel}
    %% imoprt other languages
  \\babelprovide[import]{arabic}  
  \\babelfont{rm}[Language=Default]{Georgia}
  \\babelfont[arabic]{rm}[Language=Default]{Amiri}
  \\babelfont[arabic]{sf}[Language=Default]{Noto Kufi Arabic}
  
  \\begin{document}
${generateLatexForLines(lines)}
\\end{document}
  `;

  return (
    <div className="app">
      {/* Display the generated LaTeX code in a textarea for copy-pasting or further manipulation */}
      <textarea value={latexDocument} readOnly style={{width: '100%', height: '500px'}}></textarea>
    </div>
  );
};

export default PDFView;
