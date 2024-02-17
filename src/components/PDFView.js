import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import fetchWithAuth from '../functions/FetchWithAuth';
import { ThemeContext } from './ThemeContext';

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
      \\begin{Parallel}{0.48\\textwidth}{0.48\\textwidth}
      \\begin{Spacing}{1.00}
  \\ParallelLText{ \\noindent ${line.English}}
  \\ParallelRText{ \\vspace*{-6mm} \\begin{Arabic} \\noindent
  ${line.Arabic}
  \\end{Arabic}}
  \\end{Spacing}
  \\end{Parallel}
  `;
  
      // Only add commentary formatting if Commentary is not empty
      if (line.commentary && line.commentary.trim() !== '') {
        latex += `
  % Commentary formatting
  \\vspace{1em} % Add some vertical space before the commentary
  \\fontsize{8pt}{10pt}\\selectfont
  \\noindent ${line.commentary}
  \\vspace{1em} % Add some vertical space after the commentary
  \\normalsize % Reset to the normal font size and line spacing for the document

  `;
      }
      else{
          latex += `
          \\vspace{1em} % Add some vertical space after the commentary
          \\normalsize % Reset to the normal font size and line spacing for the document
          `;
      }
  
      return latex;
    }).join('\n');
  };
  

  // Complete LaTeX document
  const latexDocument = `
\\documentclass[b6paper,10pt,twoside]{memoir}

% Set page layout
\\setlrmarginsandblock{2cm}{2cm}{*} % Left and right margin
\\setulmarginsandblock{2.5cm}{2.5cm}{*} % Upper and lower margin
\\checkandfixthelayout

% Multilingual support
\\usepackage{polyglossia}
\\setmainlanguage{english}
\\setotherlanguage{arabic}
\\usepackage{needspace}

% Font selection
\\newfontfamily\\arabicfont[Script=Arabic]{Amiri} % or any other Arabic font
\\setmainfont{Georgia} % or any other font for English

% For parallel texts
\\usepackage{parallel}

% Additional packages for enhanced commentary formatting
\\usepackage{setspace} % For setting spacing

\\begin{document}
\\begin{Spacing}{1.00}

\\chapter*{Title of the Chapter}

\\needspace{3cm} % Adjust the space requirement as needed
${generateLatexForLines(lines)}
\\end{Spacing}
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
