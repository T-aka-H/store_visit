import React from 'react';

const ClassificationTable = ({ category, items }) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-2">{category}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left border-b">コメント</th>
              <th className="px-4 py-2 text-center border-b w-24">信頼度</th>
              <th className="px-4 py-2 text-center border-b w-32">記録時刻</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">{item.text}</td>
                <td className="px-4 py-2 text-center border-b">
                  {typeof item.confidence === 'number' 
                    ? `${Math.round(item.confidence * 100)}%`
                    : item.confidence}
                </td>
                <td className="px-4 py-2 text-center border-b text-sm">
                  {item.timestamp || new Date().toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClassificationTable; 