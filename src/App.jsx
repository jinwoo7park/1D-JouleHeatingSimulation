import React, { useState } from 'react'
import './App.css'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine
} from 'recharts'

const LAYER_NAMES = ['Glass', 'ITO', 'HTL', 'Perovskite', 'ETL', 'Cathode']
const DEFAULT_VALUES = {
  layer_names: LAYER_NAMES,
  k_therm_layers: [0.8, 10.0, 0.2, 0.5, 0.2, 200.0],
  rho_layers: [2500, 7140, 1000, 4100, 1200, 2700],
  c_p_layers: [1000, 280, 1500, 250, 1500, 900],
  thickness_layers_nm: [1100000, 70, 80, 280, 50, 100],
  voltage: 2.9,
  current_density: 300.0,
  epsilon_top: 0.05,
  epsilon_bottom: 0.85,
  h_conv: 10.0,
  T_ambient: 25.0, // 섭씨 (°C)
  t_start: 0,
  t_end: 1000.0
}

function App() {
  const [logoError, setLogoError] = useState(false)
  const [formData, setFormData] = useState(DEFAULT_VALUES)
  const [simulationResult, setSimulationResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLayerChange = (index, field, value) => {
    const newFormData = { ...formData }
    newFormData[field][index] = parseFloat(value) || 0
    setFormData(newFormData)
  }

  const handleGlobalChange = (field, value) => {
    setFormData({ ...formData, [field]: parseFloat(value) || 0 })
  }

  const handleResetToDefault = () => {
    setFormData(DEFAULT_VALUES)
    setSimulationResult(null)
    setError(null)
  }

  // 섭씨 <-> 켈빈 변환 함수
  const celsiusToKelvin = (celsius) => celsius + 273.15
  const kelvinToCelsius = (kelvin) => kelvin - 273.15

  const handleSimulate = async () => {
    setLoading(true)
    setError(null)
    try {
      // 섭씨를 켈빈으로 변환하여 백엔드에 전송
      const dataToSend = {
        ...formData,
        T_ambient: celsiusToKelvin(formData.T_ambient)
      }
      
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || `서버 오류: ${response.status} ${response.statusText}` }
        }
        setError(errorData.error || `서버 오류: ${response.status} ${response.statusText}`)
        return
      }
      
      const data = await response.json()
      
      if (data.success) {
        // 켈빈을 섭씨로 변환하여 저장
        const convertedData = {
          ...data,
          temperature_active: data.temperature_active.map(row => 
            row.map(kelvin => kelvinToCelsius(kelvin))
          ),
          temperature_glass: data.temperature_glass.map(row => 
            row.map(kelvin => kelvinToCelsius(kelvin))
          ),
          perovskite_center_temp: data.perovskite_center_temp.map(kelvin => 
            kelvinToCelsius(kelvin)
          )
        }
        setSimulationResult(convertedData)
      } else {
        setError(data.error || '시뮬레이션 실행 중 오류가 발생했습니다.')
      }
    } catch (err) {
      console.error('API 호출 오류:', err)
      setError(`서버에 연결할 수 없습니다: ${err.message || '네트워크 오류가 발생했습니다.'}`)
    } finally {
      setLoading(false)
    }
  }

  // 히트맵 데이터 준비
  const prepareHeatmapData = () => {
    if (!simulationResult) return []
    
    const data = []
    const { time, position_nm, temperature } = simulationResult
    
    for (let i = 0; i < time.length; i++) {
      for (let j = 0; j < position_nm.length; j++) {
        data.push({
          time: time[i],
          position: position_nm[j],
          temperature: temperature[j][i]
        })
      }
    }
    return data
  }

  // Glass 물결선 데이터
  const getGlassWavyProfile = () => {
    if (!simulationResult) return []
    
    const { time, temperature_glass } = simulationResult
    const finalTimeIndex = time.length - 1
    
    if (!temperature_glass || temperature_glass.length === 0) return []
    
    const glassStartTemp = temperature_glass[0][finalTimeIndex]
    const glassEndTemp = temperature_glass[temperature_glass.length - 1][finalTimeIndex]
    const nPoints = 50
    const result = []
    
    for (let i = 0; i <= nPoints; i++) {
      const x = -200 + (200 / nPoints) * i
      const tBase = glassStartTemp + (glassEndTemp - glassStartTemp) * (i / nPoints)
      // 물결 모양 추가
      const amplitude = Math.abs(glassEndTemp - glassStartTemp) * 0.02
      const wave = amplitude * Math.sin((i / nPoints) * 4 * Math.PI)
      result.push({
        position: x,
        temperature: tBase + wave
      })
    }
    
    return result
  }
  
  // 활성층 온도 프로파일 데이터
  const getActiveProfile = () => {
    if (!simulationResult) return []
    
    const { time, position_active_nm, temperature_active } = simulationResult
    const finalTimeIndex = time.length - 1
    
    if (!position_active_nm || !temperature_active) return []
    
    return position_active_nm.map((pos, idx) => ({
      position: pos,
      temperature: temperature_active[idx][finalTimeIndex]
    }))
  }
  
  // 페로브스카이트 중간 지점의 시간에 따른 온도 데이터
  const getPerovskiteCenterProfile = () => {
    if (!simulationResult) return []
    
    const { time, perovskite_center_temp } = simulationResult
    
    return time.map((t, idx) => ({
      time: t,
      temperature: perovskite_center_temp[idx]
    }))
  }
  
  // 레이어 색상 가져오기 (입력창과 동일한 색상)
  const getLayerColor = (layerIndex) => {
    // Glass는 인덱스 0이지만 그래프에서는 제외되므로, 활성층은 인덱스 1부터 시작
    const adjustedIndex = layerIndex + 1  // ITO는 인덱스 1
    return `hsl(${adjustedIndex * 60}, 70%, 80%)`
  }
  
  // 레이어 영역 데이터 (ReferenceArea용)
  const getLayerAreas = () => {
    if (!simulationResult) return []
    
    const { layer_boundaries_nm } = simulationResult
    const areas = []
    
    // 활성층 레이어들 (ITO부터 시작, 인덱스 1부터)
    for (let i = 0; i < layer_boundaries_nm.length - 1; i++) {
      areas.push({
        x1: layer_boundaries_nm[i],
        x2: layer_boundaries_nm[i + 1],
        color: getLayerColor(i),
        name: simulationResult.layer_names[i] || `Layer ${i + 1}`,
        centerX: (layer_boundaries_nm[i] + layer_boundaries_nm[i + 1]) / 2
      })
    }
    
    return areas
  }
  
  // 레이어 라벨 데이터 (그래프 위에 표시할 텍스트)
  const getLayerLabels = () => {
    if (!simulationResult) return []
    
    const labels = []
    
    // Glass 라벨 (x=-100, 중간 지점)
    labels.push({
      x: -100,
      name: 'Glass (축약)'
    })
    
    // 활성층 레이어 라벨
    const areas = getLayerAreas()
    areas.forEach(area => {
      labels.push({
        x: area.centerX,
        name: area.name
      })
    })
    
    return labels
  }

  return (
    <div className="app">
      <div className="container">
        <div className="title-section">
          <div className="title-content">
            <h1>Joule Heating Simulation (1D)</h1>
            <p className="subtitle">Heat dissipation in PeLED operation using 1D heat equation</p>
          </div>
          <img
            src="/PNEL_logo.png"
            alt="PNEL Logo"
            className="title-logo"
            onError={() => setLogoError(true)}
            style={{ display: logoError ? 'none' : 'block' }}
          />
        </div>

        <div className="simulation-container">
          {/* 소자 구조 입력 섹션 */}
          <div className="input-section">
            <h2>소자 구조 및 물성 입력</h2>
            
            {/* 레이어별 입력 */}
            <div className="layers-container">
              <div className="section-header">
                <h3>레이어 물성</h3>
                <button 
                  className="reset-button" 
                  onClick={handleResetToDefault}
                  title="모든 값을 기본값으로 되돌립니다"
                >
                  기본값으로 되돌리기
                </button>
              </div>
              <div className="layers-grid">
                {LAYER_NAMES.map((name, index) => (
                  <div key={index} className="layer-card">
                    <div className="layer-header">
                      <h4>{name}</h4>
                      <div className="layer-visual" style={{ 
                        height: `${Math.max(30, Math.log10(formData.thickness_layers_nm[index] + 1) * 10)}px`,
                        backgroundColor: `hsl(${index * 60}, 70%, 80%)`
                      }}></div>
                    </div>
                    <div className="layer-inputs">
                      <div className="input-field">
                        <label>두께 (nm)</label>
                        <input
                          type="number"
                          value={formData.thickness_layers_nm[index]}
                          onChange={(e) => handleLayerChange(index, 'thickness_layers_nm', e.target.value)}
                          step="0.1"
                        />
                      </div>
                      <div className="input-field">
                        <label>열전도도 (W/m·K)</label>
                        <input
                          type="number"
                          value={formData.k_therm_layers[index]}
                          onChange={(e) => handleLayerChange(index, 'k_therm_layers', e.target.value)}
                          step="0.1"
                        />
                      </div>
                      <div className="input-field">
                        <label>밀도 (kg/m³)</label>
                        <input
                          type="number"
                          value={formData.rho_layers[index]}
                          onChange={(e) => handleLayerChange(index, 'rho_layers', e.target.value)}
                          step="1"
                        />
                      </div>
                      <div className="input-field">
                        <label>비열 (J/kg·K)</label>
                        <input
                          type="number"
                          value={formData.c_p_layers[index]}
                          onChange={(e) => handleLayerChange(index, 'c_p_layers', e.target.value)}
                          step="1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 전기적 파라미터 */}
            <div className="parameters-section">
              <h3>전기적 파라미터</h3>
              <div className="parameters-grid">
                <div className="input-field">
                  <label>전압 (V)</label>
                  <input
                    type="number"
                    value={formData.voltage}
                    onChange={(e) => handleGlobalChange('voltage', e.target.value)}
                    step="0.1"
                  />
                </div>
                <div className="input-field">
                  <label>전류 밀도 (A/m²)</label>
                  <input
                    type="number"
                    value={formData.current_density}
                    onChange={(e) => handleGlobalChange('current_density', e.target.value)}
                    step="1"
                  />
                </div>
              </div>
            </div>

            {/* 열적 파라미터 */}
            <div className="parameters-section">
              <h3>열적 파라미터</h3>
              <div className="parameters-grid">
                <div className="input-field">
                  <label>상부 방사율 (Cathode)</label>
                  <input
                    type="number"
                    value={formData.epsilon_top}
                    onChange={(e) => handleGlobalChange('epsilon_top', e.target.value)}
                    step="0.01"
                    min="0"
                    max="1"
                  />
                </div>
                <div className="input-field">
                  <label>하부 방사율 (Glass)</label>
                  <input
                    type="number"
                    value={formData.epsilon_bottom}
                    onChange={(e) => handleGlobalChange('epsilon_bottom', e.target.value)}
                    step="0.01"
                    min="0"
                    max="1"
                  />
                </div>
                <div className="input-field">
                  <label>대류 계수 (W/m²·K)</label>
                  <input
                    type="number"
                    value={formData.h_conv}
                    onChange={(e) => handleGlobalChange('h_conv', e.target.value)}
                    step="0.1"
                  />
                </div>
                <div className="input-field">
                  <label>주변 온도 (°C)</label>
                  <input
                    type="number"
                    value={formData.T_ambient}
                    onChange={(e) => handleGlobalChange('T_ambient', e.target.value)}
                    step="1"
                  />
                </div>
              </div>
            </div>

            {/* 시뮬레이션 시간 설정 */}
            <div className="parameters-section">
              <h3>시뮬레이션 시간</h3>
              <div className="parameters-grid">
                <div className="input-field">
                  <label>시작 시간 (s)</label>
                  <input
                    type="number"
                    value={formData.t_start}
                    onChange={(e) => handleGlobalChange('t_start', e.target.value)}
                    step="0.1"
                  />
                </div>
                <div className="input-field">
                  <label>종료 시간 (s)</label>
                  <input
                    type="number"
                    value={formData.t_end}
                    onChange={(e) => handleGlobalChange('t_end', e.target.value)}
                    step="10"
                  />
                </div>
              </div>
            </div>

            <button 
              className="simulate-button" 
              onClick={handleSimulate}
              disabled={loading}
            >
              {loading ? '시뮬레이션 실행 중...' : '시뮬레이션 실행'}
            </button>

            {error && <div className="error-message">{error}</div>}
          </div>

          {/* 결과 시각화 섹션 */}
          {simulationResult && (
            <div className="results-section">
              <h2>시뮬레이션 결과</h2>
              
              {/* 최종 온도 프로파일 */}
              <div className="chart-container" style={{ position: 'relative' }}>
                <h3 style={{ marginBottom: '60px' }}>최종 온도 프로파일 (t = {simulationResult.time[simulationResult.time.length - 1].toFixed(1)} s)</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="position" 
                      type="number"
                      label={{ value: 'ITO/Glass 경계로부터의 위치 (nm)', position: 'insideBottom', offset: -5 }}
                      domain={['dataMin', 'dataMax']}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      label={{ value: '온도 (°C)', angle: -90, position: 'insideLeft' }}
                      domain={['auto', 'auto']}
                      allowDataOverflow={false}
                      tick={{ angle: -30, textAnchor: 'end' }}
                    />
                    <Tooltip />
                    {/* 레이어 영역 표시 */}
                    {getLayerAreas().map((area, idx) => (
                      <ReferenceArea
                        key={`area-${idx}`}
                        x1={area.x1}
                        x2={area.x2}
                        fill={area.color}
                        fillOpacity={0.15}
                      />
                    ))}
                    {/* 레이어 경계 수직선 */}
                    {simulationResult.layer_boundaries_nm.slice(1).map((boundary, idx) => (
                      <ReferenceLine
                        key={`line-${idx}`}
                        x={boundary}
                        stroke="#888"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                      />
                    ))}
                    <Line 
                      data={getGlassWavyProfile()}
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      data={getActiveProfile()}
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#2563eb" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {/* 레이어 라벨 오버레이 */}
                <div style={{
                  position: 'absolute',
                  top: '50px',
                  left: '60px',
                  right: '20px',
                  height: '310px',
                  pointerEvents: 'none'
                }}>
                  {/* Glass 라벨 */}
                  <div style={{
                    position: 'absolute',
                    left: 'calc((100% - 60px) * (-100 - (-200)) / (580 - (-200)))',
                    top: '10px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#333',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    padding: '2px 6px',
                    borderRadius: '3px'
                  }}>
                    Glass (축약)
                  </div>
                  {/* 활성층 레이어 라벨 */}
                  {getLayerAreas().map((area, idx) => {
                    const xMin = -200
                    const xMax = 580
                    const xPercent = ((area.centerX - xMin) / (xMax - xMin)) * 100
                    return (
                      <div
                        key={`label-${idx}`}
                        style={{
                          position: 'absolute',
                          left: `${xPercent}%`,
                          transform: 'translateX(-50%)',
                          top: '10px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: '#333',
                          backgroundColor: 'rgba(255, 255, 255, 0.8)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {area.name}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 페로브스카이트 중간 지점의 시간에 따른 온도 */}
              <div className="chart-container">
                <h3>페로브스카이트 중간 지점의 시간에 따른 온도</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={getPerovskiteCenterProfile()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      type="number"
                      label={{ value: '시간 (s)', position: 'insideBottom', offset: -5 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      label={{ value: '온도 (°C)', angle: -90, position: 'insideLeft' }}
                      domain={['auto', 'auto']}
                      allowDataOverflow={false}
                    />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#16a34a" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 저장 및 내보내기 버튼 */}
              <div style={{ marginTop: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    // CSV 저장
                    const { time, position_active_nm, temperature_active, position_glass_nm, temperature_glass } = simulationResult
                    const finalTimeIndex = time.length - 1
                    
                    let csvContent = 'Position (nm),Temperature (°C)\n'
                    
                    // Glass 데이터
                    if (position_glass_nm && temperature_glass) {
                      position_glass_nm.forEach((pos, idx) => {
                        csvContent += `${pos},${temperature_glass[idx][finalTimeIndex]}\n`
                      })
                    }
                    
                    // 활성층 데이터
                    if (position_active_nm && temperature_active) {
                      position_active_nm.forEach((pos, idx) => {
                        csvContent += `${pos},${temperature_active[idx][finalTimeIndex]}\n`
                      })
                    }
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                    const link = document.createElement('a')
                    const url = URL.createObjectURL(blob)
                    link.setAttribute('href', url)
                    link.setAttribute('download', `temperature_profile_t${time[finalTimeIndex].toFixed(1)}s.csv`)
                    link.style.visibility = 'hidden'
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4a90e2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  CSV 저장
                </button>
                
                <button
                  onClick={() => {
                    // PDF 저장 (인쇄 기능 활용)
                    const printWindow = window.open('', '_blank')
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Temperature Profile</title>
                            <style>
                              body { font-family: Arial, sans-serif; padding: 20px; }
                              h1 { color: #333; }
                              .chart-container { margin: 20px 0; }
                            </style>
                          </head>
                          <body>
                            <h1>최종 온도 프로파일 (t = ${simulationResult.time[simulationResult.time.length - 1].toFixed(1)} s)</h1>
                            <p>이 창에서 인쇄하여 PDF로 저장할 수 있습니다.</p>
                            <p>인쇄 대화상자에서 "대상"을 "PDF로 저장"으로 선택하세요.</p>
                            <script>
                              window.onload = function() {
                                window.print();
                              };
                            </script>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  PDF 저장
                </button>
                
                <button
                  onClick={() => {
                    // 새창에서 열기
                    const newWindow = window.open('', '_blank')
                    if (newWindow) {
                      const { time, position_active_nm, temperature_active, position_glass_nm, temperature_glass } = simulationResult
                      const finalTimeIndex = time.length - 1
                      
                      let htmlContent = `
                        <html>
                          <head>
                            <title>Temperature Profile - t = ${time[finalTimeIndex].toFixed(1)} s</title>
                            <style>
                              body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                              .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                              h1 { color: #333; margin-bottom: 20px; }
                              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                              th { background-color: #4a90e2; color: white; }
                              tr:hover { background-color: #f5f5f5; }
                            </style>
                          </head>
                          <body>
                            <div class="container">
                              <h1>최종 온도 프로파일 (t = ${time[finalTimeIndex].toFixed(1)} s)</h1>
                              <table>
                                <thead>
                                  <tr>
                                    <th>위치 (nm)</th>
                                    <th>온도 (°C)</th>
                                  </tr>
                                </thead>
                                <tbody>
                      `
                      
                      // Glass 데이터
                      if (position_glass_nm && temperature_glass) {
                        position_glass_nm.forEach((pos, idx) => {
                          htmlContent += `<tr><td>${pos.toFixed(2)}</td><td>${temperature_glass[idx][finalTimeIndex].toFixed(4)}</td></tr>\n`
                        })
                      }
                      
                      // 활성층 데이터
                      if (position_active_nm && temperature_active) {
                        position_active_nm.forEach((pos, idx) => {
                          htmlContent += `<tr><td>${pos.toFixed(2)}</td><td>${temperature_active[idx][finalTimeIndex].toFixed(4)}</td></tr>\n`
                        })
                      }
                      
                      htmlContent += `
                                </tbody>
                              </table>
                            </div>
                          </body>
                        </html>
                      `
                      
                      newWindow.document.write(htmlContent)
                      newWindow.document.close()
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  새창에서 열기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
